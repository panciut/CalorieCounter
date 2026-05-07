import { useState, useEffect } from 'react';

const DB_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const BASE_IMG_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

// In-memory cache
let cachedExercises: any[] | null = null;
let fetchingPromise: Promise<any[]> | null = null;

export function useExerciseImages(exerciseName: string) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchMatches() {
      try {
        if (!cachedExercises) {
          if (!fetchingPromise) {
            fetchingPromise = fetch(DB_URL).then(r => r.json());
          }
          cachedExercises = await fetchingPromise;
        }

        if (!isMounted || !cachedExercises) return;

        // Fuzzy match: remove special chars, spaces, and make lowercase
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const target = normalize(exerciseName);

        // 1. Try exact normalized match
        let match = cachedExercises.find(ex => normalize(ex.name) === target);

        // 2. Try includes match
        if (!match) {
          match = cachedExercises.find(ex => normalize(ex.name).includes(target) || target.includes(normalize(ex.name)));
        }

        if (match && match.images && match.images.length > 0) {
          // Images in DB are like "3_4_Sit-Up/0.jpg", we prepend the base URL
          setImages(match.images.map((img: string) => `${BASE_IMG_URL}${img}`));
        } else {
          setImages([]);
        }
      } catch (error) {
        console.error('Failed to fetch exercise images:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchMatches();

    return () => {
      isMounted = false;
    };
  }, [exerciseName]);

  return { images, loading };
}
