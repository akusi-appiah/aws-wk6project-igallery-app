export type image = { key: string; url: string }; // Type for image URL

export interface ImageListResponse {
  images: { key: string; url: string }[];
  nextToken?: string;
}