import { useState, useEffect } from 'react';

// Topics index matches the order in unga_topics_compact.json
const TOPICS = [
  "Decolonization",
  "Development & Economy",
  "Environment",
  "Human Rights / Social",
  "International Law & Justice",
  "Middle East (General)",
  "Nuclear / Arms / Disarmament",
  "Palestine / Israel",
  "Peacekeeping & Security",
  "UN Administration"
] as const;

export type TopicName = typeof TOPICS[number];

export type CountryTopics = {
  disagreements: TopicName[];
  agreements: TopicName[];
};

type CompactTopicsData = {
  topics: string[];
  countries: Record<string, { dis: number[]; agr: number[] }>;
};

let cachedData: Record<string, CountryTopics> | null = null;

export function useTopicsData(): {
  topicsMap: Record<string, CountryTopics> | null;
  loading: boolean;
  error: Error | null;
} {
  const [topicsMap, setTopicsMap] = useState<Record<string, CountryTopics> | null>(cachedData);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (cachedData) return;

    const loadData = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}unga_topics_compact.json`);
        if (!response.ok) throw new Error('Failed to load topics data');
        
        const data: CompactTopicsData = await response.json();
        const topics = data.topics;
        
        // Transform compact format to usable format
        const result: Record<string, CountryTopics> = {};
        for (const [code, { dis, agr }] of Object.entries(data.countries)) {
          result[code] = {
            disagreements: dis.map(i => topics[i] as TopicName),
            agreements: agr.map(i => topics[i] as TopicName),
          };
        }
        
        cachedData = result;
        setTopicsMap(result);
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return { topicsMap, loading, error };
}

export function getTopicLabel(topic: TopicName): string {
  // Return a shorter/friendlier label for display
  // Using exact Dutch terms as specified
  const labels: Record<TopicName, string> = {
    "Decolonization": "Dekolonisatie",
    "Development & Economy": "Ontwikkeling en economie",
    "Environment": "Milieu",
    "Human Rights / Social": "Mensenrechten",
    "International Law & Justice": "Internationaal recht en justitie",
    "Middle East (General)": "Midden-Oosten (algemeen)",
    "Nuclear / Arms / Disarmament": "Nucleair / wapens",
    "Palestine / Israel": "Palestina / Israël",
    "Peacekeeping & Security": "Vredeshandhaving",
    "UN Administration": "VN bestuur"
  };
  return labels[topic];
}

