import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'room/:roomId',
    loadComponent: () => import('./pages/room/room.page').then((m) => m.RoomPage),
  },
  { path: '**', redirectTo: '' },
];
