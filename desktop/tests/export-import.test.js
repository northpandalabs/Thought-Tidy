// Tests for desktop/ipc-handlers.js makeBackupHandlers
const { makeBackupHandlers } = require("../ipc-handlers");

const FAKE_PATH    = "/tmp/thought-tidy-backup-20260606.ttbackup";
const FAKE_CONTENT = '{"version":1,"exported_at":"2026-06-06","auth":"abc"}';

function makeDialog({ savePath = FAKE_PATH, cancelled = false, openPaths = [FAKE_PATH], openCancelled = false } = {}) {
  return {
    showSaveDialog: jest.fn().mockResolvedValue({
      canceled:  cancelled,
      filePath:  cancelled ? undefined : savePath
    }),
    showOpenDialog: jest.fn().mockResolvedValue({
      canceled:   openCancelled,
      filePaths:  openCancelled ? [] : openPaths
    })
  };
}

function makeFs({ content = FAKE_CONTENT, readThrows = false } = {}) {
  return {
    writeFileSync: jest.fn(),
    readFileSync:  readThrows
      ? jest.fn().mockImplementation(() => { throw new Error("File not found"); })
      : jest.fn().mockReturnValue(content)
  };
}

// ── saveBackup ────────────────────────────────────────────────────────────────

describe("makeBackupHandlers — saveBackup", () => {
  test("calls dialog.showSaveDialog with suggested filename", async () => {
    const dialog   = makeDialog();
    const fs       = makeFs();
    const handlers = makeBackupHandlers(dialog, fs);
    await handlers.saveBackup(null, { content: FAKE_CONTENT, filename: "backup.ttbackup" });
    expect(dialog.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "backup.ttbackup" })
    );
  });

  test("writes content to chosen file path", async () => {
    const dialog   = makeDialog();
    const fs       = makeFs();
    const handlers = makeBackupHandlers(dialog, fs);
    await handlers.saveBackup(null, { content: FAKE_CONTENT, filename: "backup.ttbackup" });
    expect(fs.writeFileSync).toHaveBeenCalledWith(FAKE_PATH, FAKE_CONTENT, "utf8");
  });

  test("returns { success: true } on successful write", async () => {
    const handlers = makeBackupHandlers(makeDialog(), makeFs());
    const result   = await handlers.saveBackup(null, { content: FAKE_CONTENT, filename: "x.ttbackup" });
    expect(result).toEqual({ success: true });
  });

  test("returns { success: false } when dialog is cancelled", async () => {
    const handlers = makeBackupHandlers(makeDialog({ cancelled: true }), makeFs());
    const result   = await handlers.saveBackup(null, { content: FAKE_CONTENT, filename: "x.ttbackup" });
    expect(result).toEqual({ success: false });
  });
});

// ── openBackup ────────────────────────────────────────────────────────────────

describe("makeBackupHandlers — openBackup", () => {
  test("calls dialog.showOpenDialog", async () => {
    const dialog   = makeDialog();
    const handlers = makeBackupHandlers(dialog, makeFs());
    await handlers.openBackup();
    expect(dialog.showOpenDialog).toHaveBeenCalled();
  });

  test("returns file content string on success", async () => {
    const handlers = makeBackupHandlers(makeDialog(), makeFs());
    const result   = await handlers.openBackup();
    expect(result).toBe(FAKE_CONTENT);
  });

  test("returns null when dialog is cancelled", async () => {
    const handlers = makeBackupHandlers(makeDialog({ openCancelled: true }), makeFs());
    const result   = await handlers.openBackup();
    expect(result).toBeNull();
  });

  test("returns null when file cannot be read", async () => {
    const handlers = makeBackupHandlers(makeDialog(), makeFs({ readThrows: true }));
    const result   = await handlers.openBackup();
    expect(result).toBeNull();
  });
});
