/**
 * Compression client-side avant upload.
 *
 * Pourquoi : les photos iPhone (20-50MB) surchargent la RAM Railway et tuent le container.
 * Fix : réduire à ~2MB dans le navigateur avant d'envoyer. Résultat visuellement identique.
 *
 * - Max 4096px sur le plus grand côté (iPhone 17 Pro natif = 4032px → aucune perte réelle)
 * - JPEG 92% → taille ÷10 à ÷20, qualité indistinguable à l'œil
 * - Vidéos : retournées intactes
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      const MAX = 4096
      let { width: w, height: h } = img

      // Redimensionner seulement si nécessaire
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX }
        else        { w = Math.round(w * MAX / h); h = MAX }
      }

      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)

      canvas.toBlob(
        (blob) => resolve(
          blob
            ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
            : file  // fallback : fichier original si canvas échoue
        ),
        'image/jpeg',
        0.92
      )
    }

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}
