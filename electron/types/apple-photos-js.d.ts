// Type declaration for apple-photos-js
declare module 'apple-photos-js' {
  interface Photo {
    uuid: string
    cloudId: string
    filePath: string
    filename: string
    fileSize: number
    width: number
    height: number
    takenAt: string
    creationDate: string
    cameraModel: string
    lensModel: string
    iso: number
    fNumber: number
    exposureTime: number
    location: {
      latitude: number
      longitude: number
    }
  }

  class Photos {
    constructor(libraryPath: string)
    getAllPhotos(): Photo[]
    getPhotoById(id: string): Photo | null
  }

  export default class ApplePhotos {
    static Photos: typeof Photos
  }
}
