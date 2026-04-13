'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCachedUser, setCachedUser } from '@/lib/authCache';

export default function HomeRedirector() {
    const router = useRouter();

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                const cachedUser = getCachedUser();

                if (cancelled) return;

                if (cachedUser) {
                    router.replace('/mypage');
                    return;
                }

                // Lazy-load Supabase only if needed; keep homepage paint unblocked.
                const { default: supabase } = await import('@/lib/supabase');
                const { data: { user }, error } = await supabase.auth.getUser();

                if (cancelled) return;
                if (error || !user) return;

                // Cache user so subsequent navigations are faster.
                setCachedUser(user);

                // Avoid blocking on additional DB lookups here.
                // /mypage can decide further routing if needed.
                router.replace('/mypage');
            } catch {
                // If anything fails, keep showing the public homepage.
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [router]);

    return null;
}
