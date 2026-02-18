import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { Route, Stop } from '../models/route.model';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private readonly genAI: GoogleGenAI;

  constructor() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API_KEY environment variable not set.");
    }
    this.genAI = new GoogleGenAI({ apiKey });
  }

  async findRoute(query: string): Promise<Route> {
    const prompt = `You are an expert urban transport cartographer for Estelí, Nicaragua.
    Your task is to provide the data for a single, real bus route based on the user's query.
    The user is asking for: "${query}".
    
    Provide a detailed path as a list of coordinates that follows real streets. The path must connect all the stops in order and form a complete loop, ending where it started.
    Provide a list of at least 15-20 realistic stops for this route, each with a name and its precise geographic coordinates in [latitude, longitude] format.
    
    Your response MUST be a single JSON object matching the provided schema. Do not include any text or markdown formatting (like \`\`\`json) outside of the JSON object.`;

    const routeSchema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "The official name of the bus route." },
        stops: {
          type: Type.ARRAY,
          description: "An ordered list of stops along the route.",
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "The name of the bus stop." },
              coordinates: {
                type: Type.ARRAY,
                description: "The geographic coordinates [latitude, longitude].",
                items: { type: Type.NUMBER }
              }
            },
            required: ["name", "coordinates"]
          }
        },
        path: {
          type: Type.ARRAY,
          description: "An ordered list of coordinates [lat, lon] that defines the route's path on the map.",
          items: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER }
          }
        }
      },
      required: ["name", "stops", "path"]
    };

    try {
       const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: routeSchema,
        }
      });
      
      const jsonText = response.text.trim();
      const routeData = JSON.parse(jsonText);
      
      // Basic validation
      if (!routeData.name || !Array.isArray(routeData.stops) || !Array.isArray(routeData.path)) {
          throw new Error("AI response is missing required route data fields.");
      }

      return routeData as Route;

    } catch(error) {
        console.error('Error finding route from AI:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`AI call failed for route finding. Original error: ${errorMessage}`);
    }
  }

  async generateStopAnnouncement(stopName: string): Promise<string> {
    const prompt = `You are a helpful and engaging tour guide on a bus in Estelí, Nicaragua. 
    Your role is to announce the next stop and provide a brief, interesting fact or mention a nearby point of interest.
    The announcement should be a single, friendly sentence.
    The upcoming stop is "${stopName}".
    
    Focus on local culture, history, or nearby attractions.
    Keep the entire announcement under 20 words.
    
    Example for "Catedral": "Approaching the Catedral, a beautiful landmark known for its stunning neoclassical architecture."
    Example for "Parque Central": "Next up is Parque Central, the perfect place to relax and enjoy the city's atmosphere."
    Example for "Mercado": "We're arriving at the Mercado Municipal, where you can find fresh local produce and crafts."
    
    Now, create a new, engaging announcement for the stop: "${stopName}"`;

    try {
      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            temperature: 0.7,
        }
      });
      // Trim whitespace and remove any surrounding quotes Gemini might add.
      return response.text.trim().replace(/^"|"$/g, '');
    } catch (error) {
      console.error('Error generating announcement:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`API call failed for stop announcement. Please check your API key and network connection. Original error: ${errorMessage}`);
    }
  }

  async generateChatResponse(userMessage: string, currentRoute: Route | null, nextStop: Stop | null): Promise<string> {
    let context = "The user is currently on a bus in Estelí, Nicaragua.";
    if (currentRoute) {
      context += ` They are on the route "${currentRoute.name}".`;
    }
    if (nextStop) {
      context += ` Their next stop is "${nextStop.name}".`;
    }

    const prompt = `You are a friendly and helpful AI assistant for the "Estelí Bus Tracker" application. 
    Your knowledge is focused on Estelí, Nicaragua.
    You can answer questions about bus routes, stops, local points of interest, food, culture, and general information about the city.
    Be concise and helpful in your responses.

    Current context: ${context}

    User's question: "${userMessage}"
    `;

    try {
      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          temperature: 0.5,
        }
      });
      return response.text.trim();
    } catch (error) {
      console.error('Error generating chat response:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`API call failed for chat response. Please check your API key and network connection. Original error: ${errorMessage}`);
    }
  }
}
