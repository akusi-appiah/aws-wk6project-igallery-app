export type image = {
  id: string;
  key: string;
  url: string;
  fileName: string;
  fileDescription: string | null;
  uploadedAt: string;
};

export interface ImageListResponse {
  images_data: image[];
  nextPage?: number;
}