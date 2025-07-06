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
   * @returns A promise that resolves to the URL of the uploaded image.
   */

  uploadImage(file: File): Observable<any> {
    const form = new FormData();
    form.append('image', file);
    return this.http.post(`${this.baseUrl}/upload`, form);
  }


  // List images with pagination

  listImages(token?: string, size: number = 3): Observable<ImageListResponse> {
    let query = `?size=${size}`;
    if (token) {
      query += `&token=${encodeURIComponent(token)}`;
    }
    return this.http.get<ImageListResponse>(`${this.baseUrl}/images${query}`);
  }
  
  /**
   * Deletes an image with the given key from the server.
   * @param key The key of the image to delete.
   * @returns An Observable that emits the response from the server.
   */

  deleteImage(key: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/images/${encodeURIComponent(key)}`);
  }
}
