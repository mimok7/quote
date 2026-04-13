'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import PageWrapper from '../../components/PageWrapper';
import SectionBox from '../../components/SectionBox';
import Link from 'next/link';
import supabase from '@/lib/supabase';
import { clearCachedUser } from '@/lib/authCache';
import { clearAuthCache } from '@/hooks/useAuth';
import { clearInvalidSession, isInvalidRefreshTokenError } from '@/lib/authRecovery';

export default function MyPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadUserInfo = async () => {
      try {
        setLoading(true);

        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (!mounted) return;

        if (userError || !user) {
          if (userError && isInvalidRefreshTokenError(userError)) {
            await clearInvalidSession();
          }
          router.push('/login');
          return;
        }

        const { data: profile } = await supabase
          .from('users')
          .select('name')
          .eq('id', user.id)
          .maybeSingle();

        if (!mounted) return;

        setUser(user);
        setUserProfile(profile);
      } catch (error) {
        if (isInvalidRefreshTokenError(error)) {
          await clearInvalidSession();
          if (mounted) router.push('/login');
          return;
        }
        console.error('사용자 정보 로드 실패:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadUserInfo();

    return () => { mounted = false; };
  }, [router]);

  const getUserDisplayName = useCallback(() => {
    if (userProfile?.name) return userProfile.name;
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return '고객';
  }, [userProfile, user]);

  const handleLogout = useCallback(async () => {
    try {
      clearCachedUser();
      clearAuthCache();
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('로그아웃 오류:', error);
        alert('로그아웃 중 오류가 발생했습니다.');
        return;
      }
      alert('로그아웃되었습니다.');
      router.push('/login');
    } catch (error) {
      console.error('로그아웃 처리 실패:', error);
      alert('로그아웃 처리에 실패했습니다.');
    }
  }, [router]);

  const quickActions = [
    { icon: '📋', label: '견적 목록', href: '/mypage/quotes', description: '작성한 견적을 조회하고 관리합니다' },
    { icon: '➕', label: '새 견적', href: '/mypage/quotes/new', description: '크루즈, 공항, 호텔, 투어, 렌트카 견적 작성' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <PageWrapper title={`🌟 ${getUserDisplayName()}님 환영합니다`}>
      <div className="mb-6 flex justify-end items-center gap-3">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium shadow-sm"
        >
          🚪 로그아웃
        </button>
      </div>

      <SectionBox title="견적 관리">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quickActions.map((action, index) => (
            <Link key={index} href={action.href} className="group">
              <div className="bg-white border border-gray-200 rounded-lg p-6 hover:border-blue-500 hover:shadow-md transition-all duration-200">
                <div className="flex items-start gap-4">
                  <div className="text-4xl">{action.icon}</div>
                  <div className="flex-1">
                    <div className="font-bold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">
                      {action.label}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{action.description}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </SectionBox>
    </PageWrapper>
  );
}
