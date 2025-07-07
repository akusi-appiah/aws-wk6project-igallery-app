import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { ImageService } from '../../services/image.service';
import { CommonModule } from '@angular/common';
import { image } from '../../types/image.types';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule,FormsModule],
  templateUrl: './gallery.component.html',
  styleUrl: './gallery.component.css'
})


export class GalleryComponent implements OnInit {
  imageList=signal<image[]>([]); 
  currentPage = signal<number>(1); // Current page number
  nextPage=signal<number|null>(null);
  loading = signal(false);
  error=signal<string | null>(null);
  selectedFile=signal<File | undefined>(undefined);
  fileDescription = signal<string>('');
  viewerDescription = signal<string>('');
  displayImageUrl = signal<string | null>(null);
  selectedImageUrl = signal<string | null>(null);// URL for selected image
  galleryForm = viewChild<ElementRef<HTMLFormElement>>('fileForm');
  imageService = inject(ImageService); 

  constructor() {}

  ngOnInit() {
    this.loadImages();
  }

  // Load images (first page or with token)
  loadImages(page: number = this.currentPage()) {
    this.loading.set(true);
    this.imageService.listImages(page).subscribe({
      next: (res) => {
        this.imageList.set(res.images_data || []);
        this.nextPage.set(res.nextPage ?? null);
        this.clearImageDescription();
        this.resetInputForm();
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load images');
        this.loading.set(false);
        console.error(err);
      }
    });
  }

  // Go forward
  next() {
    if (this.nextPage()) {
      this.currentPage.set(this.nextPage()!);
      this.loadImages(this.nextPage()!);
    }
  }

  // Go back
  back() {
    if (this.currentPage() > 1) {
      this.currentPage.set(this.currentPage() - 1);
      this.loadImages(this.currentPage());
    }
  }

  showPreviewWindow = computed(()=>this.imageList().length || this.selectedFile());

  // File selection
  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedFile.set(input.files[0]);
      this.selectedImageUrl.set(URL.createObjectURL(this.selectedFile()!));
      this.viewerDescription.set(this.selectedImageUrl()!);
      this.displayImageUrl.set(this.selectedImageUrl());// Show selected image
    }
  }

  // Upload then refresh
  upload() {
    if (!this.selectedFile) return;
    this.loading.set(true);
    this.imageService.uploadImage(this.selectedFile()!, this.fileDescription() || null).subscribe({
      next: (res) => {
        this.selectedFile.set(undefined);
        this.fileDescription.set('');
        this.selectedImageUrl.set(res.url);
        this.currentPage.set(1);
        this.nextPage.set(null);
        this.loadImages();
      },
      error: (err) => {
        this.error.set('Upload failed');
        this.loading.set(false);
        console.error(err);
      }
    });
  }

  // Delete an image
  delete(id: string) {
    if (!confirm('Delete this image?')) return;
    this.loading.set(true);
    this.imageService.deleteImage(id).subscribe({
      next: () => {
        this.clearImageDescription();
        // Check if the current page will be empty after deletion
        const updatedList = this.imageList().filter(img => img.id !== id);
        this.imageList.set(updatedList);
        if (updatedList.length === 0 && this.currentPage() > 1) {
          // Revert to previous page if current page is empty and not page 1
          this.currentPage.set(this.currentPage() - 1);
          this.loadImages(this.currentPage());
        } else {
          // Reload current page or display empty page if on page 1
          this.loadImages(this.currentPage());
        }
      },
      error: (err) => {
        this.error.set('Delete failed');
        this.loading.set(false);
        console.error(err);
      }
    });
  }

  viewImage(img:image) {
    this.displayImageUrl.set(img.url);
    this.selectedImageUrl.set(img.fileName);
    this.viewerDescription.set(img.fileDescription ?? '');
  }

  clearImageDescription() {
   this.displayImageUrl.set(null);
    this.selectedImageUrl.set('');
  }

  resetInputForm() {
    this.galleryForm()?.nativeElement.reset();
    this.selectedFile.set(undefined);
    this.fileDescription.set('');
    this.displayImageUrl.set(null);
    this.selectedImageUrl.set('');
    this.viewerDescription.set('');
  }
}

