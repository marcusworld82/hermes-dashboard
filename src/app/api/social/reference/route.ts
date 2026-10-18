import { handle } from "@/lib/server/http";
import { fetchReference, fileToText } from "@/lib/server/reference";
import { getCarousel, updateCarousel } from "@/lib/server/carousels";

// Reads a reference link or file into the carousel's referenceText. Multipart: carouselId, and url or file.
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const id = String(form.get("carouselId") ?? "");
    const url = String(form.get("url") ?? "").trim();
    const file = form.get("file");
    const car = getCarousel(id);
    const text = file instanceof File && file.size ? await fileToText(Buffer.from(await file.arrayBuffer()), file.type, file.name) : url ? await fetchReference(url) : "";
    if (!text) throw new Error("Add a link or a file.");
    return { carousel: updateCarousel(id, { inputs: { ...car.inputs, referenceUrl: url || (file instanceof File ? file.name : ""), referenceText: text } }), chars: text.length };
  });
}
