use std::fs::FileType;
use std::path::Path;
use std::path::PathBuf;

use async_trait::async_trait;
use codex_utils_string::take_bytes_at_char_boundary;
use serde::Deserialize;
use tokio::fs;

use crate::function_tool::FunctionCallError;
use crate::tools::context::ToolInvocation;
use crate::tools::context::ToolOutput;
use crate::tools::context::ToolPayload;
use crate::tools::registry::ToolHandler;
use crate::tools::registry::ToolKind;

pub struct ListDirHandler;

const MAX_ENTRY_LENGTH: usize = 500;

fn default_offset() -> usize {
    1
}

fn default_limit() -> usize {
    2000
}

fn default_depth() -> usize {
    2
}

#[derive(Deserialize)]
struct ListDirArgs {
    dir_path: String,
    #[serde(default = "default_offset")]
    offset: usize,
    #[serde(default = "default_limit")]
    limit: usize,
    #[serde(default = "default_depth")]
    depth: usize,
}

#[async_trait]
impl ToolHandler for ListDirHandler {
    fn kind(&self) -> ToolKind {
        ToolKind::Function
    }

    async fn handle(&self, invocation: ToolInvocation) -> Result<ToolOutput, FunctionCallError> {
        let ToolInvocation { payload, .. } = invocation;

        let arguments = match payload {
            ToolPayload::Function { arguments } => arguments,
            _ => {
                return Err(FunctionCallError::RespondToModel(
                    "list_dir handler received unsupported payload".to_string(),
                ));
            }
        };

        let args: ListDirArgs = serde_json::from_str(&arguments).map_err(|err| {
            FunctionCallError::RespondToModel(format!(
                "failed to parse function arguments: {err:?}"
            ))
        })?;

        let ListDirArgs {
            dir_path,
            offset,
            limit,
            depth,
        } = args;

        if offset == 0 {
            return Err(FunctionCallError::RespondToModel(
                "offset must be a 1-indexed entry number".to_string(),
            ));
        }

        if limit == 0 {
            return Err(FunctionCallError::RespondToModel(
                "limit must be greater than zero".to_string(),
            ));
        }

        if depth == 0 {
            return Err(FunctionCallError::RespondToModel(
                "depth must be greater than zero".to_string(),
            ));
        }

        let path = PathBuf::from(&dir_path);
        if !path.is_absolute() {
            return Err(FunctionCallError::RespondToModel(
                "dir_path must be an absolute path".to_string(),
            ));
        }

        let entries = list_dir_slice(&path, offset, limit, depth).await?;
        Ok(ToolOutput::Function {
            content: entries.join("\n"),
            success: Some(true),
        })
    }
}

async fn list_dir_slice(
    path: &Path,
    offset: usize,
    limit: usize,
    depth: usize,
) -> Result<Vec<String>, FunctionCallError> {
    let mut entries = Vec::new();
    collect_entries(path, Path::new(""), depth, &mut entries).await?;

    entries.sort_unstable_by(|a, b| a.name.cmp(&b.name));

    if entries.is_empty() {
        return Ok(Vec::new());
    }

    let start_index = offset - 1;
    if start_index >= entries.len() {
        return Err(FunctionCallError::RespondToModel(
            "offset exceeds directory entry count".to_string(),
        ));
    }

    let end_index = (start_index + limit).min(entries.len());
    let mut formatted = Vec::with_capacity(end_index - start_index);

    for (position, entry) in entries[start_index..end_index].iter().enumerate() {
        let ordinal = start_index + position + 1;
        formatted.push(format!("E{ordinal}: {} {}", entry.kind.label(), entry.name));
    }

    Ok(formatted)
}

async fn collect_entries(
    dir_path: &Path,
    relative_prefix: &Path,
    depth: usize,
    entries: &mut Vec<DirEntry>,
) -> Result<(), FunctionCallError> {
    let mut stack = vec![(dir_path.to_path_buf(), relative_prefix.to_path_buf(), depth)];

    while let Some((current_dir, prefix, remaining_depth)) = stack.pop() {
        let mut read_dir = fs::read_dir(&current_dir).await.map_err(|err| {
            FunctionCallError::RespondToModel(format!("failed to read directory: {err}"))
        })?;

        while let Some(entry) = read_dir.next_entry().await.map_err(|err| {
            FunctionCallError::RespondToModel(format!("failed to read directory: {err}"))
        })? {
            let file_type = entry.file_type().await.map_err(|err| {
                FunctionCallError::RespondToModel(format!("failed to inspect entry: {err}"))
            })?;

            let file_name = entry.file_name();
            let relative_path = if prefix.as_os_str().is_empty() {
                PathBuf::from(&file_name)
            } else {
                prefix.join(&file_name)
            };

            let display_name = format_entry_name(&relative_path.to_string_lossy());
            let kind = DirEntryKind::from(&file_type);
            entries.push(DirEntry {
                name: display_name,
                kind,
            });

            if kind == DirEntryKind::Directory && remaining_depth > 1 {
                stack.push((entry.path(), relative_path, remaining_depth - 1));
            }
        }
    }

    Ok(())
}

fn format_entry_name(name: &str) -> String {
    if name.len() > MAX_ENTRY_LENGTH {
        take_bytes_at_char_boundary(name, MAX_ENTRY_LENGTH).to_string()
    } else {
        name.to_string()
    }
}

#[derive(Clone)]
struct DirEntry {
    name: String,
    kind: DirEntryKind,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum DirEntryKind {
    Directory,
    File,
    Symlink,
    Other,
}

impl DirEntryKind {
    fn label(self) -> &'static str {
        match self {
            DirEntryKind::Directory => "[dir]",
            DirEntryKind::File => "[file]",
            DirEntryKind::Symlink => "[symlink]",
            DirEntryKind::Other => "[other]",
        }
    }
}

impl From<&FileType> for DirEntryKind {
    fn from(file_type: &FileType) -> Self {
        if file_type.is_symlink() {
            DirEntryKind::Symlink
        } else if file_type.is_dir() {
            DirEntryKind::Directory
        } else if file_type.is_file() {
            DirEntryKind::File
        } else {
            DirEntryKind::Other
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn lists_directory_entries() {
        let temp = tempdir().expect("create tempdir");
        let dir_path = temp.path();

        let sub_dir = dir_path.join("nested");
        tokio::fs::create_dir(&sub_dir)
            .await
            .expect("create sub dir");

        let deeper_dir = sub_dir.join("deeper");
        tokio::fs::create_dir(&deeper_dir)
            .await
            .expect("create deeper dir");

        tokio::fs::write(dir_path.join("entry.txt"), b"content")
            .await
            .expect("write file");
        tokio::fs::write(sub_dir.join("child.txt"), b"child")
            .await
            .expect("write child");
        tokio::fs::write(deeper_dir.join("grandchild.txt"), b"grandchild")
            .await
            .expect("write grandchild");

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let link_path = dir_path.join("link");
            symlink(dir_path.join("entry.txt"), &link_path).expect("create symlink");
        }

        let entries = list_dir_slice(dir_path, 1, 20, 3)
            .await
            .expect("list directory");

        #[cfg(unix)]
        let expected = vec![
            "E1: [file] entry.txt".to_string(),
            "E2: [symlink] link".to_string(),
            "E3: [dir] nested".to_string(),
            "E4: [file] nested/child.txt".to_string(),
            "E5: [dir] nested/deeper".to_string(),
            "E6: [file] nested/deeper/grandchild.txt".to_string(),
        ];

        #[cfg(not(unix))]
        let expected = vec![
            "E1: [file] entry.txt".to_string(),
            "E2: [dir] nested".to_string(),
            "E3: [file] nested/child.txt".to_string(),
            "E4: [dir] nested/deeper".to_string(),
            "E5: [file] nested/deeper/grandchild.txt".to_string(),
        ];

        assert_eq!(entries, expected);
    }

    #[tokio::test]
    async fn errors_when_offset_exceeds_entries() {
        let temp = tempdir().expect("create tempdir");
        let dir_path = temp.path();
        tokio::fs::create_dir(dir_path.join("nested"))
            .await
            .expect("create sub dir");

        let err = list_dir_slice(dir_path, 10, 1, 2)
            .await
            .expect_err("offset exceeds entries");
        assert_eq!(
            err,
            FunctionCallError::RespondToModel("offset exceeds directory entry count".to_string())
        );
    }

    #[tokio::test]
    async fn respects_depth_parameter() {
        let temp = tempdir().expect("create tempdir");
        let dir_path = temp.path();
        let nested = dir_path.join("nested");
        let deeper = nested.join("deeper");
        tokio::fs::create_dir(&nested).await.expect("create nested");
        tokio::fs::create_dir(&deeper).await.expect("create deeper");
        tokio::fs::write(dir_path.join("root.txt"), b"root")
            .await
            .expect("write root");
        tokio::fs::write(nested.join("child.txt"), b"child")
            .await
            .expect("write nested");
        tokio::fs::write(deeper.join("grandchild.txt"), b"deep")
            .await
            .expect("write deeper");

        let entries_depth_one = list_dir_slice(dir_path, 1, 10, 1)
            .await
            .expect("list depth 1");
        assert_eq!(
            entries_depth_one,
            vec![
                "E1: [dir] nested".to_string(),
                "E2: [file] root.txt".to_string(),
            ]
        );

        let entries_depth_two = list_dir_slice(dir_path, 1, 20, 2)
            .await
            .expect("list depth 2");
        assert_eq!(
            entries_depth_two,
            vec![
                "E1: [dir] nested".to_string(),
                "E2: [file] nested/child.txt".to_string(),
                "E3: [dir] nested/deeper".to_string(),
                "E4: [file] root.txt".to_string(),
            ]
        );

        let entries_depth_three = list_dir_slice(dir_path, 1, 30, 3)
            .await
            .expect("list depth 3");
        assert_eq!(
            entries_depth_three,
            vec![
                "E1: [dir] nested".to_string(),
                "E2: [file] nested/child.txt".to_string(),
                "E3: [dir] nested/deeper".to_string(),
                "E4: [file] nested/deeper/grandchild.txt".to_string(),
                "E5: [file] root.txt".to_string(),
            ]
        );
    }
}
