import { Component, ChangeDetectionStrategy, signal, inject, AfterViewInit, ElementRef, viewChild, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocationSimulatorService } from './services/location-simulator.service';
import { RouteService } from './services/route.service';
import { GeminiService } from './services/gemini.service';
import { Route, Stop } from './models/route.model';
import { ChatMessage } from './models/chat.model';

// This is to inform TypeScript about the Leaflet global object `L`
declare var L: any;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RouteService, GeminiService, LocationSimulatorService],
})
export class AppComponent implements AfterViewInit {
  readonly locationSimulatorService = inject(LocationSimulatorService);
  private readonly routeService = inject(RouteService);
  private readonly geminiService = inject(GeminiService);
  
  private readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('map');
  private readonly chatHistoryContainer = viewChild<ElementRef<HTMLDivElement>>('chatHistoryContainer');

  private map: any;
  private busMarker: any;
  private routePolyline: any;
  private stopMarkers: any[] = [];
  private routeTooltip: any;

  // --- State Signals ---
  currentRoute = signal<Route | null>(null);
  statusMessage = signal('Search for a bus route to begin.');
  nextStop = signal<Stop | null>(null);
  upcomingStops = signal<Stop[]>([]);
  passedStops = signal<Set<string>>(new Set());
  announcement = signal<string | null>(null);
  isLoadingAnnouncement = signal(false);
  
  // --- AI Route Search State ---
  routeSearchQuery = signal('Ruta Rosario'); // Default search for user convenience
  isSearchingRoute = signal(false);
  searchError = signal<string | null>(null);

  // --- Chat State Signals ---
  isChatOpen = signal(false);
  chatMessages = signal<ChatMessage[]>([]);
  isChatLoading = signal(false);
  chatInput = signal('');

  // --- UI Computations ---
  displayedStops = computed(() => {
    const allStops = this.currentRoute()?.stops ?? [];
    const next = this.nextStop();
    if (!next) return allStops;
    
    const nextIndex = allStops.findIndex(s => s.name === next.name);
    return allStops.slice(Math.max(0, nextIndex -1));
  });

  constructor() {
    // Effect to handle location updates from the simulator
    effect(() => {
      const pos = this.locationSimulatorService.position();
      const error = this.locationSimulatorService.error();

      if (error) {
        this.statusMessage.set(`Simulation Error: ${error}`);
        return;
      }

      if (pos) {
        this.statusMessage.set('Simulation active.');
        this.updateBusPosition(pos);
      }
    }, { allowSignalWrites: true });

    // Effect to generate AI announcements for the next stop
    effect(async () => {
      const stop = this.nextStop();
      if (stop && this.map) { // ensure this doesn't run on init before map is ready
        this.isLoadingAnnouncement.set(true);
        this.announcement.set(null);
        try {
          const ann = await this.geminiService.generateStopAnnouncement(stop.name);
          this.announcement.set(ann);
        } catch (e) {
            console.error(e);
          this.announcement.set('Could not load announcement.');
        } finally {
            this.isLoadingAnnouncement.set(false);
        }
      }
    }, { allowSignalWrites: true });

    // Effect to handle route changes: start simulation and redraw on map
    effect(() => {
      const route = this.currentRoute();
      if (route) {
        this.statusMessage.set(`Tracking ${route.name}`);
        this.locationSimulatorService.startSimulation(route);
        // Reset progress when route changes
        this.nextStop.set(route.stops[0] ?? null);
        this.upcomingStops.set(route.stops);
        this.passedStops.set(new Set());
        this.announcement.set(null);
        this.chatMessages.set([]); // Also clear chat on route change
        
        if (this.map) {
          this.clearRouteFromMap();
          this.drawRouteOnMap(route);
        }
      } else {
        this.locationSimulatorService.stopSimulation();
         if (this.map) {
          this.clearRouteFromMap();
        }
      }
    }, { allowSignalWrites: true });

    // Effect to scroll chat to the bottom
    effect(() => {
      if (this.isChatOpen() && this.chatMessages().length) {
        this.scrollToBottom();
      }
    });
  }

  ngAfterViewInit(): void {
    this.initMap();
    // Automatically search for a default route on startup
    if (this.routeSearchQuery()) {
      this.searchForRoute();
    }
  }

  private initMap(): void {
    const container = this.mapContainer()?.nativeElement;
    if (!container) return;

    // Estelí coordinates
    const esteliCoords: [number, number] = [13.092, -86.358];

    this.map = L.map(container).setView(esteliCoords, 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(this.map);

    const route = this.currentRoute();
    if (route) {
        this.drawRouteOnMap(route);
    }
  }

  private drawRouteOnMap(route: Route): void {
    if (!this.map) return;
    // Draw path
    this.routePolyline = L.polyline(route.path, { color: '#dc2626' }).addTo(this.map); // red-600
    this.map.fitBounds(this.routePolyline.getBounds().pad(0.1));

    // Draw stops
    const stopIcon = L.divIcon({
        html: `<div class="w-3 h-3 bg-gray-300 rounded-full border-2 border-gray-800"></div>`,
        className: '',
        iconSize: [12, 12],
    });

    this.stopMarkers = route.stops.map(stop => {
        const marker = L.marker(stop.coordinates, { icon: stopIcon }).addTo(this.map);
        marker.bindTooltip(stop.name, {
            permanent: false,
            direction: 'top',
            offset: L.point(0, -10),
            className: 'bg-gray-800 text-white rounded px-2 py-1 border-0'
        });
        return marker;
    });
  }

  private clearRouteFromMap(): void {
    if (this.busMarker) {
        this.map.removeLayer(this.busMarker);
        this.busMarker = null;
    }
    if (this.routePolyline) {
        this.map.removeLayer(this.routePolyline);
        this.routePolyline = null;
    }
    this.stopMarkers.forEach(marker => this.map.removeLayer(marker));
    this.stopMarkers = [];
  }

  private updateBusPosition(pos: GeolocationPosition): void {
    const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
    const route = this.currentRoute();

    if (!route || !this.map) return;

    const progress = this.routeService.getRouteProgress(coords, route);

    this.nextStop.set(progress.nextStop);
    this.upcomingStops.set(progress.upcomingStops);
    this.passedStops.set(progress.passedStops);

    const busIcon = L.divIcon({
        html: `<div class="w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg animate-pulse"></div>`,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    if (this.busMarker) {
        this.busMarker.setLatLng(coords);
    } else {
        this.busMarker = L.marker(coords, { icon: busIcon }).addTo(this.map);
    }
    
    // Show route name tooltip when near a stop
    const stop = progress.nextStop;
    if (stop) {
        const distanceToStop = L.latLng(coords).distanceTo(L.latLng(stop.coordinates));
        if (distanceToStop < 50) { // 50 meters threshold
             if (!this.routeTooltip) {
                this.routeTooltip = L.tooltip({
                    permanent: true,
                    direction: 'top',
                    offset: L.point(0, -20),
                    className: 'route-tooltip'
                }).setContent(route.name);
                this.busMarker.bindTooltip(this.routeTooltip).openTooltip();
            }
        } else {
            if (this.routeTooltip) {
                this.busMarker.unbindTooltip();
                this.routeTooltip = null;
            }
        }
    }


    this.map.panTo(coords, { animate: true, duration: 0.5 });
  }

  // --- UI Methods ---

  async searchForRoute(): Promise<void> {
    const query = this.routeSearchQuery().trim();
    if (!query) return;

    this.isSearchingRoute.set(true);
    this.searchError.set(null);
    this.currentRoute.set(null); // Clear current route
    this.statusMessage.set(`Finding route for "${query}"...`);

    try {
        const route = await this.geminiService.findRoute(query);
        this.currentRoute.set(route);
    } catch (error) {
        console.error('Failed to find route:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        this.searchError.set(`Could not find route. ${errorMessage}`);
        this.statusMessage.set(`Error finding route. Please try another search.`);
    } finally {
        this.isSearchingRoute.set(false);
    }
  }

  // --- Chat Methods ---
  toggleChat(): void {
    this.isChatOpen.update(v => !v);
  }
  
  async sendMessage(): Promise<void> {
    const messageContent = this.chatInput().trim();
    if (!messageContent || this.isChatLoading()) return;

    // 1. Add user message to history
    this.chatMessages.update(messages => [...messages, { role: 'user', content: messageContent }]);
    this.chatInput.set('');
    this.isChatLoading.set(true);
    this.scrollToBottom();

    try {
      // 2. Get AI response
      const response = await this.geminiService.generateChatResponse(
        messageContent,
        this.currentRoute(),
        this.nextStop()
      );
      
      // 3. Add AI message to history
      this.chatMessages.update(messages => [...messages, { role: 'model', content: response }]);
    } catch (error) {
      console.error('Error sending message:', error);
      this.chatMessages.update(messages => [...messages, { role: 'model', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      this.isChatLoading.set(false);
      this.scrollToBottom();
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
        try {
            const container = this.chatHistoryContainer()?.nativeElement;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        } catch (err) {
            console.error(err);
        }
    }, 0);
  }
}
