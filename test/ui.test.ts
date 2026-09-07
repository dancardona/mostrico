import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataField } from "@/components/ui";

describe("shared data fields", () => {
  it.each([undefined, "", 0])("keeps zero and labels missing data (%s)", (value) => {
    const html = renderToStaticMarkup(createElement(DataField, { label: "Monto", value }));
    expect(html).toContain(value === 0 ? "<dd>0</dd>" : "<dd>No disponible</dd>");
  });
});
