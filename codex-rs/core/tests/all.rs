use codex_apply_patch::apply_patch;
use codex_core::CODEX_APPLY_PATCH_ARG1;

#[ctor::ctor]
fn emulate_codex_apply_patch_when_invoked_with_flag() {
    let mut args = std::env::args();
    let _ = args.next();
    let Some(arg1) = args.next() else {
        return;
    };
    if arg1 != CODEX_APPLY_PATCH_ARG1 {
        return;
    }

    let Some(patch) = args.next() else {
        eprintln!("Error: {CODEX_APPLY_PATCH_ARG1} requires a UTF-8 PATCH argument.");
        std::process::exit(1);
    };

    let mut stdout = std::io::stdout();
    let mut stderr = std::io::stderr();
    let exit_code = match apply_patch(&patch, &mut stdout, &mut stderr) {
        Ok(()) => 0,
        Err(err) => {
            eprintln!("{err}");
            1
        }
    };
    std::process::exit(exit_code);
}

// Single integration test binary that aggregates all test modules.
// The submodules live in `tests/all/`.
mod suite;
