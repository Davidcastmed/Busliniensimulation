import { Injectable } from '@angular/core';
import { Route, Stop } from '../models/route.model';

interface RouteProgress {
  closestPoint: [number, number];
  nextStop: Stop | null;
  upcomingStops: Stop[];
  passedStops: Set<string>;
}

@Injectable({
  providedIn: 'root'
})
export class RouteService {
  private routes: Route[] = [];

  // A simplified implementation for finding route progress
  getRouteProgress(currentCoords: [number, number], route: Route): RouteProgress {
    const closestPointOnPath = this.findClosestPointOnPath(currentCoords, route.path);
    
    let nextStopIndex = -1;
    let minDistanceToStop = Infinity;
    
    // Find total distance of the route path
    let totalPathDistance = 0;
    for (let i = 0; i < route.path.length - 1; i++) {
        totalPathDistance += this.haversineDistance(route.path[i], route.path[i+1]);
    }

    // Find user's progress along the path
    let userPathProgress = 0;
    let foundClosestSegment = false;
    for (let i = 0; i < route.path.length - 1; i++) {
        const segmentStart = route.path[i];
        const segmentEnd = route.path[i+1];
        if (!foundClosestSegment) {
            // Project the point onto the segment line
            const p: [number, number] = [currentCoords[0], currentCoords[1]];
            const a: [number, number] = [segmentStart[0], segmentStart[1]];
            const b: [number, number] = [segmentEnd[0], segmentEnd[1]];
            const closestOnLine = this.closestPointOnSegment(p, a, b);
            
            // Check if projection is within the segment bounds
            const isWithinSegment = 
                Math.min(a[0], b[0]) <= closestOnLine[0] && closestOnLine[0] <= Math.max(a[0], b[0]) &&
                Math.min(a[1], b[1]) <= closestOnLine[1] && closestOnLine[1] <= Math.max(a[1], b[1]);

            if (isWithinSegment) {
                userPathProgress += this.haversineDistance(segmentStart, currentCoords);
                foundClosestSegment = true;
            } else {
                 userPathProgress += this.haversineDistance(segmentStart, segmentEnd);
            }
        }
    }

    // Find next stop based on progress
    for(let i = 0; i < route.stops.length; i++) {
        const stopCoords = route.stops[i].coordinates;
        let stopPathProgress = 0;
        let foundStopSegment = false;
         for (let j = 0; j < route.path.length - 1; j++) {
            const segmentStart = route.path[j];
            const segmentEnd = route.path[j+1];
            if (!foundStopSegment) {
                const closestOnSeg = this.closestPointOnSegment(stopCoords, segmentStart, segmentEnd);
                // Check if the closest point is actually the stop coordinate
                if (this.haversineDistance(closestOnSeg, stopCoords) < 0.05) { // 50 meters tolerance
                    stopPathProgress += this.haversineDistance(segmentStart, stopCoords);
                    foundStopSegment = true;
                } else {
                    stopPathProgress += this.haversineDistance(segmentStart, segmentEnd);
                }
            }
        }

        if (stopPathProgress >= userPathProgress) {
             const dist = stopPathProgress - userPathProgress;
             if (dist < minDistanceToStop) {
                minDistanceToStop = dist;
                nextStopIndex = i;
             }
        }
    }

    if (nextStopIndex === -1 && route.stops.length > 0) {
        // If past all stops, loop back to the first one
        nextStopIndex = 0;
    }

    const nextStop = nextStopIndex !== -1 ? route.stops[nextStopIndex] : null;
    const upcomingStops = nextStopIndex !== -1 ? route.stops.slice(nextStopIndex) : [];
    const passedStops = new Set(route.stops.slice(0, nextStopIndex).map(s => s.name));

    return {
      closestPoint: closestPointOnPath,
      nextStop,
      upcomingStops,
      passedStops
    };
  }

  // --- Helper functions for distance calculations ---

  private haversineDistance(coords1: [number, number], coords2: [number, number]): number {
    const toRad = (x: number) => x * Math.PI / 180;
    const R = 6371; // km
    const dLat = toRad(coords2[0] - coords1[0]);
    const dLon = toRad(coords2[1] - coords1[1]);
    const lat1 = toRad(coords1[0]);
    const lat2 = toRad(coords2[0]);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

   private findClosestPointOnPath(point: [number, number], path: [number, number][]): [number, number] {
    let closestPoint: [number, number] = path[0];
    let minDistance = Infinity;

    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];
      const currentClosest = this.closestPointOnSegment(point, p1, p2);
      const distance = this.haversineDistance(point, currentClosest);
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = currentClosest;
      }
    }
    return closestPoint;
  }

  private closestPointOnSegment(p: [number, number], a: [number, number], b: [number, number]): [number, number] {
    const ap: [number, number] = [p[0] - a[0], p[1] - a[1]];
    const ab: [number, number] = [b[0] - a[0], b[1] - a[1]];
    const ab2 = ab[0] * ab[0] + ab[1] * ab[1];
    if (ab2 === 0) {
        return a;
    }
    const ap_ab = ap[0] * ab[0] + ap[1] * ab[1];
    let t = ap_ab / ab2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return [a[0] + ab[0] * t, a[1] + ab[1] * t];
  }

}
