import { Component } from '@angular/core';
import { GalleryComponent } from './pages/gallery/gallery.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GalleryComponent],
  template: '<app-gallery></app-gallery>',
})
export class AppComponent {}