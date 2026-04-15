declare module 'piexifjs' {
  const piexif: {
    remove(dataUrl: string): string
    load(dataUrl: string): unknown
    dump(exif: unknown): string
    insert(exif: string, dataUrl: string): string
  }
  export default piexif
}
