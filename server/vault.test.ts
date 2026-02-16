import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@shared/models/auth", () => ({
  secretsVault: { key: "key", value: "value" },
}));

import { db } from "./db";
import { getSecret, getSecrets, clearVaultCache } from "./vault";

function mockDbRows(rows: { key: string; value: string }[]) {
  const fromMock = vi.fn().mockResolvedValue(rows);
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });
  (db.select as any).mockImplementation(selectMock);
  return selectMock;
}

describe("vault", () => {
  beforeEach(() => {
    clearVaultCache();
    vi.clearAllMocks();
  });

  it("getSecret returns a stored secret", async () => {
    mockDbRows([
      { key: "AWS_REGION", value: "us-west-2" },
      { key: "AWS_S3_BUCKET", value: "my-bucket" },
    ]);
    const result = await getSecret("AWS_REGION");
    expect(result).toBe("us-west-2");
  });

  it("getSecret returns undefined for missing key", async () => {
    mockDbRows([{ key: "AWS_REGION", value: "us-west-2" }]);
    const result = await getSecret("NONEXISTENT");
    expect(result).toBeUndefined();
  });

  it("getSecrets returns multiple secrets", async () => {
    mockDbRows([
      { key: "AWS_REGION", value: "us-west-2" },
      { key: "AWS_S3_BUCKET", value: "my-bucket" },
      { key: "GOOGLE_CLIENT_ID", value: "gid-123" },
    ]);
    const result = await getSecrets(["AWS_REGION", "AWS_S3_BUCKET", "MISSING"]);
    expect(result).toEqual({
      AWS_REGION: "us-west-2",
      AWS_S3_BUCKET: "my-bucket",
      MISSING: undefined,
    });
  });

  it("caches results and does not re-query within TTL", async () => {
    const selectMock = mockDbRows([{ key: "KEY1", value: "val1" }]);
    await getSecret("KEY1");
    await getSecret("KEY1");
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("clearVaultCache forces a re-query", async () => {
    const selectMock = mockDbRows([{ key: "KEY1", value: "val1" }]);
    await getSecret("KEY1");
    clearVaultCache();
    mockDbRows([{ key: "KEY1", value: "val2" }]);
    const result = await getSecret("KEY1");
    expect(result).toBe("val2");
  });
});
