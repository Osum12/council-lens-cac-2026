import { useEffect } from 'react';
import { usePlace } from './placeContext';

export function usePageTitle(title: string | null) {
  const place = usePlace();
  useEffect(() => {
    document.title = [title, place?.name, 'Council Lens'].filter(Boolean).join(' · ');
  }, [title, place]);
}
