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

#[derive(Deserialize)]
struct ListDirArgs {
    dir_path: String,
    #[serde(default = "default_offset")]
    offset: usize,
    #[serde(default = "default_limit")]
    limit: usize,
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

        let path = PathBuf::from(&dir_path);
        if !path.is_absolute() {
            return Err(FunctionCallError::RespondToModel(
                "dir_path must be an absolute path".to_string(),
            ));
        }

        let entries = list_dir_slice(&path, offset, limit).await?;
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
) -> Result<Vec<String>, FunctionCallError> {
    let mut read_dir = fs::read_dir(path).await.map_err(|err| {
        FunctionCallError::RespondToModel(format!("failed to read directory: {err}"))
    })?;

    let mut entries = Vec::new();

    while let Some(entry) = read_dir.next_entry().await.map_err(|err| {
        FunctionCallError::RespondToModel(format!("failed to read directory: {err}"))
    })? {
        let file_type = entry.file_type().await.map_err(|err| {
            FunctionCallError::RespondToModel(format!("failed to inspect entry: {err}"))
        })?;

        let name = entry.file_name();
        let name = name.to_string_lossy();
        let name = format_entry_name(&name);
        let kind = DirEntryKind::from(&file_type);
        entries.push(DirEntry { name, kind });
    }

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

#[derive(Clone, Copy)]
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
    use tokio::io::AsyncWriteExt;

    #[tokio::test]
    async fn lists_directory_entries() {
        let temp = tempdir().expect("create tempdir");
        let dir_path = temp.path();

        let sub_dir = dir_path.join("nested");
        tokio::fs::create_dir(&sub_dir)
            .await
            .expect("create sub dir");

        let file_path = dir_path.join("entry.txt");
        let mut file = tokio::fs::File::create(&file_path)
            .await
            .expect("create file");
        file.write_all(b"content").await.expect("write file");

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let link_path = dir_path.join("link");
            symlink(&file_path, &link_path).expect("create symlink");
        }

        let entries = list_dir_slice(dir_path, 1, 10)
            .await
            .expect("list directory");

        assert!(entries.iter().any(|entry| entry.contains("[dir] nested")));
        assert!(
            entries
                .iter()
                .any(|entry| entry.contains("[file] entry.txt"))
        );

        #[cfg(unix)]
        assert!(entries.iter().any(|entry| entry.contains("[symlink] link")));
    }

    #[tokio::test]
    async fn errors_when_offset_exceeds_entries() {
        let temp = tempdir().expect("create tempdir");
        let dir_path = temp.path();
        let sub_dir = dir_path.join("nested");
        tokio::fs::create_dir(&sub_dir)
            .await
            .expect("create sub dir");

        let err = list_dir_slice(dir_path, 10, 1)
            .await
            .expect_err("offset exceeds entries");
        assert_eq!(
            err,
            FunctionCallError::RespondToModel("offset exceeds directory entry count".to_string())
        );
    }
}
