import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable  } from 'rxjs';
import { ImageListResponse } from '../types/image.types';

@Injectable({
  providedIn: 'root'
})


export class ImageService {
  constructor(private readonly http: HttpClient) {}
  private readonly baseUrl = this.getBaseUrl();

  private getBaseUrl(): string {
    // Use relative path in production, localhost in development
    return window.location.hostname === 'localhost' 
      ? 'http://localhost:3000' 
      : '';
  }

  /**
   * Uploads an image file to the server.
   * @param file The image file to upload.
   * @param description Optional description for the image.
   * If provided, it will be sent along with the image.
   * @returns A promise that resolves to the URL of the uploaded image.
   */

  uploadImage(file: File, description: string | null): Observable<any> {
    const form = new FormData();
    form.append('image', file);
    if (description) {
      form.append('description', description);
    }
    return this.http.post(`${this.baseUrl}/upload`, form);
  }


  // List images with pagination

  /**
   * List images with pagination. The page number is 1-indexed, meaning the
   * first page is page 1, not page 0.
   * @param page The page number to retrieve. Defaults to 1.
   * @param size The number of items per page. Defaults to 3.
   * @returns An Observable that emits the response from the server.
   */
  listImages(page: number = 1, size: number = 3): Observable<ImageListResponse> {
    return this.http.get<ImageListResponse>(`${this.baseUrl}/images?page=${page}&size=${size}`);
  }

  /**
   * Deletes an image with the given key from the server.
   * @param id The id of the image to delete.
   * @returns An Observable that emits the response from the server.
   */

  deleteImage(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/images/${encodeURIComponent(id)}`);
  }
}
