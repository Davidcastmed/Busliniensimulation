export interface Stop {
  name: string;
  coordinates: [number, number];
}

export interface Route {
  name: string;
  /** A series of coordinates that define the route path for drawing on the map */
  path: [number, number][];
  /** A list of designated stops along the route */
  stops: Stop[];
}
