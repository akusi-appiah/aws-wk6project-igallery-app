import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { ImageService } from '../../services/image.service';
import { CommonModule } from '@angular/common';
import { image } from '../../types/image.types';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gallery.component.html',
  styleUrl: './gallery.component.css'
})


export class GalleryComponent implements OnInit {
  imageList=signal<image[]>([]); 
  nextToken: string|null = null; // Token for next page
  prevTokens: (string|null)[] = [];
  currentToken: string| null = null; // Current token for back navigation

  loading = false;
  error:string| null = null;
  selectedFile=signal<File | undefined>(undefined);
  displayImageUrl: string | null = null;
  selectedImageUrl: string| null  = null; // URL for selected image

  galleryForm = viewChild<ElementRef<HTMLFormElement>>('fileForm');
  imageService = inject(ImageService); 

  constructor() {}

  ngOnInit() {
    this.loadImages();
  }

  // Load images (first page or with token)
  loadImages(token:string | null = null, fallback = true) {
    this.loading = true;
    this.imageService.listImages(token ?? undefined).subscribe({
      next: (res) => {
        const images = res.images || [];
        this.nextToken = res.nextToken ?? null;
        this.currentToken = token;
        this.clearImageDescription();
        this.resetInputForm(); // Reset form after loading images
        this.loading = false;

        // Fallback if page is empty and it's not the first page
        if (images.length === 0 && fallback && this.prevTokens.length > 0) {
          const prevToken = this.prevTokens.pop()!;
          this.loadImages(prevToken, false); // 👈 Don't fallback again
          return;
        }

        this.imageList.set(images); // Update image list
      },
      error: (err) => {
        this.error = 'Failed to load images';
        this.loading = false;
        console.error(err);
      }
    });
  }

  // Go forward
  next() {
    if (this.nextToken) {
      console.log('Next token:', this.nextToken);
      this.prevTokens.push(this.currentToken); // ✅ Track where we came from
      this.loadImages(this.nextToken);
    }
  }

  // Go back
  back() {
    if (this.prevTokens.length === 0) return; // No previous tokens
    console.log('Previous tokens:', this.prevTokens);
    const prev = this.prevTokens.pop(); // Get last token
    this.loadImages(prev);  
  }

  showPreviewWindow = computed(()=>this.imageList().length || !this.imageList().length && this.selectedFile());

  // File selection
  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedFile.set(input.files[0]);
      this.selectedImageUrl= URL.createObjectURL(this.selectedFile()!);
      this.displayImageUrl = this.selectedImageUrl; // Show selected image
    }
  }

  // Upload then refresh
  upload() {
    if (!this.selectedFile) return;
    this.loading = true;
    this.imageService.uploadImage(this.selectedFile()!).subscribe({
      next: (res) => {
        this.selectedFile.set(undefined);
        this.selectedImageUrl = res;
        this.resetpaginationButtons();
        this.loadImages(); // Reload after upload
      },
      error: (err) => {
        this.error = 'Upload failed';
        this.loading = false;
        console.error(err);
      }
    });
  }

  // Delete an image
  delete(key: string) {
    if (!confirm('Delete this image?')) return;
    this.loading = true;

    this.imageService.deleteImage(key).subscribe({
      next: () => {
        this.clearImageDescription();
        this.loadImages(this.currentToken); // Reload current page
      },
      error: (err) => {
        this.error = 'Delete failed';
        this.loading = false;
        console.error(err);
      }
    });
  }

  viewImage(url:image) {
    this.displayImageUrl = url.url;
    this.selectedImageUrl = url.key.substring(8); // Remove 'upload/' prefix
  }

  clearImageDescription() {
    this.displayImageUrl = null;
    this.selectedImageUrl = "";
  }

  resetpaginationButtons(){
    this.nextToken = null;
    this.prevTokens = [];
    this.currentToken = null;
  }

  resetInputForm() {
    this.galleryForm()?.nativeElement.reset();
    this.selectedFile.set(undefined);
    this.displayImageUrl = null;
    this.selectedImageUrl = '';
  }
}

