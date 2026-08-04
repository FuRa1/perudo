import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { addIcons } from 'ionicons';
import { checkmarkCircle, dice, personCircle, skull } from 'ionicons/icons';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Ionic's standalone <ion-icon> needs icons registered by name up front (tree-shakeable —
// no CDN fetch, no bundling every icon in the set).
addIcons({ checkmarkCircle, dice, personCircle, skull });

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
