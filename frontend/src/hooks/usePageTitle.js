import { useEffect } from 'react';

export const usePageTitle = (page) => {
  useEffect(() => {
    document.title = page ? 'Pulse | ' + page : 'Pulse';
    return () => { document.title = 'Pulse'; };
  }, [page]);
};