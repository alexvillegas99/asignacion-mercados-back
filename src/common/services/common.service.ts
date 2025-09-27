const BASE64_PDF = `data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp...`; // <-- pon tu base64 real

export async function subirPdfQuemado(this: any) {
  const formData = new FormData();

  // convierte base64 dataURL -> Blob
  const blob = await (await fetch(BASE64_PDF)).blob(); // mime = application/pdf
  // campos igual que tu función original
  formData.append('imagenes', blob, 'documento.pdf');
  formData.append('ids', 'pdf');

  // si hay 1 input usabas /upload-unique; acá golpea tu backend de prueba
  this.urlfinal = `${this._url}/test-upload`; // <--- tu backend Nest

  console.log('➡️ POST', this.urlfinal);
  formData.forEach((v, k) => {
    if (v instanceof File) {
      console.log(`• ${k} = File{name=${v.name}, type=${v.type}, size=${v.size}}`);
    } else {
      console.log(`• ${k} = ${v}`);
    }
  });

  try {
    const resp = await fetch(this.urlfinal, { method: 'POST', body: formData });
    const data = await resp.json().catch(async () => ({ raw: await resp.text() }));
    console.log('⬅️ Resp', resp.status, data);

    if (!resp.ok) {
      // tu manejo de error
      return;
    }

    // si viene SESSION_ID, lo guardas como hacías antes
    const sessionId =
      data?.SESSION_ID || data?.sessionId || data?.session_id || data?.objData?.SESSION_ID;
    if (sessionId) {
      this.guardarRULarchivosenlocalstorage(sessionId);
    }
  } catch (e) {
    console.error('❌ Error', e);
  }
}