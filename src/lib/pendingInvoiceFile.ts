/**
 * Module-level stash used to pass a picked invoice file from the /achats
 * import drawer to the /invoices import flow without serializing it through
 * sessionStorage or URL params. The file is consumed once by the target page.
 */

let pendingFile: File | null = null;

export function setPendingInvoiceFile(file: File): void {
  pendingFile = file;
}

export function takePendingInvoiceFile(): File | null {
  const f = pendingFile;
  pendingFile = null;
  return f;
}
