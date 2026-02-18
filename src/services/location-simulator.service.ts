import { Injectable, signal } from '@angular/core';
import { Route } from '../models/route.model';

// This is a mock GeolocationPosition to fit the existing type
const createMockPosition = (coords: [number, number]): GeolocationPosition => ({
  coords: {
    latitude: coords[0],
    longitude: coords[1],
    accuracy: 5,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: 10, // Simulate a bus speed in m/s (e.g., ~36 km/h)
  },
  timestamp: Date.now(),
});

@Injectable({
  providedIn: 'root'
})
export class LocationSimulatorService {
  position = signal<GeolocationPosition | null>(null);
  error = signal<string | null>(null);

  private intervalId: any = null;
  private currentPath: [number, number][] = [];
  private currentSegmentIndex = 0;
  private segmentProgress = 0;
  private speed = 0.0001; // A magical number for simulation step increment

  startSimulation(route: Route): void {
    this.stopSimulation();
    if (!route || !route.path || route.path.length < 2) {
      this.error.set('Invalid route for simulation.');
      return;
    }

    this.currentPath = route.path;
    this.currentSegmentIndex = 0;
    this.segmentProgress = 0;
    
    // Randomize speed for each route simulation.
    // This value determines the increment per interval.
    this.speed = 0.00005 + Math.random() * 0.0001;

    // Set initial position
    this.position.set(createMockPosition(this.currentPath[0]));

    this.intervalId = setInterval(() => this.updatePosition(), 100); // Update every 100ms
  }

  stopSimulation(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.position.set(null);
  }

  private updatePosition(): void {
    if (!this.currentPath || this.currentPath.length < 2) {
        this.stopSimulation();
        return;
    }

    if (this.currentSegmentIndex >= this.currentPath.length - 1) {
      // Loop simulation back to the start
      this.currentSegmentIndex = 0;
      this.segmentProgress = 0;
    }

    const startPoint = this.currentPath[this.currentSegmentIndex];
    const endPoint = this.currentPath[this.currentSegmentIndex + 1];

    this.segmentProgress += this.speed;

    if (this.segmentProgress >= 1) {
      this.segmentProgress = 0;
      this.currentSegmentIndex++;
      
      // Check again if we reached the end after incrementing
      if (this.currentSegmentIndex >= this.currentPath.length - 1) {
        this.currentSegmentIndex = 0; // Loop
      }
      // Continue to the next segment in the same tick if speed is high
      this.updatePosition();
      return;
    }

    // Linear interpolation between the two points
    const newLat = startPoint[0] + (endPoint[0] - startPoint[0]) * this.segmentProgress;
    const newLon = startPoint[1] + (endPoint[1] - startPoint[1]) * this.segmentProgress;

    this.position.set(createMockPosition([newLat, newLon]));
  }
}
