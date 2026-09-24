import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileCard } from "./file-card";
import type { ProjectAsset } from "./asset-data";

vi.mock("@/features/workspace/workspace-data", () => ({
  useDateFormat: () => ({ formatDate: () => "Sep 23" }),
}));

const base: ProjectAsset = {
  id: "file-1",
  name: "Email Hero direction B.png",
  projectId: "project-1",
  path: "project-1/file-1.png",
  bucket: "delivery-files",
  mime: "image/png",
  size: 955392,
  date: "2026-09-23T12:00:00Z",
  category: "Delivery",
  approved: true,
};

function renderCard(props: Partial<Parameters<typeof FileCard>[0]> = {}) {
  const onDownload = vi.fn();
  const view = render(
    <FileCard
      file={base}
      preview={undefined}
      downloading={false}
      onDownload={onDownload}
      {...props}
    />,
  );
  return { onDownload, ...view };
}

describe("FileCard", () => {
  it("shows an image's own preview when one is signed", () => {
    const { container } = renderCard({ preview: "https://storage.example/signed.png" });
    expect(container.querySelector(".file-icon img")).toHaveAttribute(
      "src",
      "https://storage.example/signed.png",
    );
  });

  it("names a file by its own type while there is no preview", () => {
    renderCard({ file: { ...base, mime: "application/pdf", name: "Guide.pdf" } });
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("never calls a document or a video an image", () => {
    const { rerender } = renderCard({
      file: {
        ...base,
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        name: "Brief.docx",
      },
    });
    expect(screen.getByText("Word")).toBeInTheDocument();
    expect(screen.queryByText("IMAGE")).not.toBeInTheDocument();
    rerender(
      <FileCard
        file={{ ...base, mime: "video/mp4", name: "Launch.mp4" }}
        preview={undefined}
        downloading={false}
        onDownload={vi.fn()}
      />,
    );
    expect(screen.getByText("MP4")).toBeInTheDocument();
  });

  it("downloads the file, and not twice at once", async () => {
    const { onDownload, rerender } = renderCard();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Download Email Hero direction B.png" }));
    expect(onDownload).toHaveBeenCalledWith(base);
    rerender(<FileCard file={base} preview={undefined} downloading onDownload={onDownload} />);
    expect(
      screen.getByRole("button", { name: "Download Email Hero direction B.png" }),
    ).toBeDisabled();
  });

  it("states the size and date together", () => {
    renderCard();
    expect(screen.getByText("933 KB · Sep 23")).toBeInTheDocument();
  });
});
