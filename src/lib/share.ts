import { toPng } from "html-to-image";

/**
 * Render a DOM node to a PNG and either share it (mobile Web Share API,
 * with image support) or download it. Used for the "share standings /
 * my squad" banter cards.
 */
export async function shareNode(node: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#06241a",
  });

  // Try native share with the image file (mobile)
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: "image/png" });
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean;
    };
    if (nav.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: "World Cup Sweepstake" });
      return;
    }
  } catch {
    /* fall through to download */
  }

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
