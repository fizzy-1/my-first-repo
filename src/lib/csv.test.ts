import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes cells with commas, quotes and newlines", () => {
    assert.equal(csvCell('Say "hi", please'), '"Say ""hi"", please"');
    assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  });
  it("neutralises formula injection but keeps negative numbers", () => {
    assert.equal(csvCell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
    assert.equal(csvCell("+27 82 555"), "'+27 82 555");
    assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(csvCell(-1250.5), "-1250.5");
  });
  it("formats dates and empties", () => {
    assert.equal(csvCell(new Date("2026-10-07T00:00:00Z")), "2026-10-07");
    assert.equal(csvCell(null), "");
  });
  it("joins rows with CRLF", () => {
    assert.equal(toCsv(["a", "b"], [[1, 2]]), "a,b\r\n1,2\r\n");
  });
});
