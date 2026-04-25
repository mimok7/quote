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
import { createQuote } from '@/lib/quoteUtils';

export default function MyPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [existingQuotes, setExistingQuotes] = useState<any[]>([]);
  const [creatingQuote, setCreatingQuote] = useState(false);

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
      } catch (error) {        if (isInvalidRefreshTokenError(error)) {
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

  const getUserDisplayName = useCallback(() => {    if (userProfile?.name) return userProfile.name;
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return '고객';
  }, [userProfile, user]);

  const handleLogout = useCallback(async () => {    try {
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

  // 새 견적 버튼 클릭 → 기존 draft 견적 확인 후 선택 모달
  const handleNewQuoteClick = useCallback(async () => {
    if (!user) return;
    setCreatingQuote(true);
    try {
      const { data: drafts } = await supabase
        .from('quote')
        .select('id, title, created_at, status')
        .eq('user_id', user.id)
        .in('status', ['draft', 'submitted'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (drafts && drafts.length > 0) {
        setExistingQuotes(drafts);
        setShowQuoteModal(true);
      } else {
        // 기존 견적 없으면 바로 새 견적 생성
        await createNewQuote();
      }
    } catch (e) {
      console.error('견적 조회 오류:', e);
      await createNewQuote();
    } finally {
      setCreatingQuote(false);
    }
  }, [user]);

  // 자동 이름으로 새 견적 생성
  const createNewQuote = async () => {
    if (!user) return;
    setCreatingQuote(true);
    try {
      const userName = userProfile?.name || user.email?.split('@')[0] || '고객';
      const { count } = await supabase
        .from('quote')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      const nextIndex = (count ?? 0) + 1;
      const autoTitle = `${userName} 여행계획 ${nextIndex}`;
      const newQuote = await createQuote(user.id, autoTitle);
      if (newQuote) {
        router.push(`/mypage/quotes/new?quoteId=${newQuote.id}`);
      } else {
        alert('견적 생성에 실패했습니다.');
      }
    } catch (e) {
      console.error('견적 생성 오류:', e);
      alert('견적 생성 중 오류가 발생했습니다.');
    } finally {
      setCreatingQuote(false);
    }
  };

  const quickActions = [
    { icon: '📋', label: '견적 목록', href: '/mypage/quotes', description: '작성한 견적을 조회하고 관리합니다' },
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
          {/* 새 견적 버튼 */}
          <button onClick={handleNewQuoteClick} disabled={creatingQuote} className="group text-left w-full">
            <div className="bg-white border border-gray-200 rounded-lg p-6 hover:border-blue-500 hover:shadow-md transition-all duration-200">
              <div className="flex items-start gap-4">
                <div className="text-4xl">➕</div>
                <div className="flex-1">
                  <div className="font-bold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">
                    {creatingQuote ? '처리 중...' : '새 견적'}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">크루즈, 공항, 호텔, 투어, 렌트카 견적 작성</p>
                </div>
              </div>
            </div>
          </button>
        </div>
      </SectionBox>

      {/* 기존 견적 선택 모달 */}
      {showQuoteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">📋 견적 선택</h2>
            <p className="text-gray-600 text-sm mb-4">이어서 작업할 견적을 선택하거나 새 견적을 생성하세요.</p>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {existingQuotes.map((q) => (
                <button
                  key={q.id}
                  onClick={() => {
                    setShowQuoteModal(false);
                    router.push(`/mypage/quotes/new?quoteId=${q.id}`);
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all"
                >
                  <div className="font-medium text-gray-800">{q.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(q.created_at).toLocaleDateString('ko-KR')} · {q.status === 'draft' ? '작성 중' : '제출됨'}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setShowQuoteModal(false);
                  await createNewQuote();
                }}
                disabled={creatingQuote}
                className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium disabled:opacity-60"
              >
                ➕ 새 견적 생성
              </button>
              <button
                onClick={() => setShowQuoteModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
