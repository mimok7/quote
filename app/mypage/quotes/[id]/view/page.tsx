'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { upgradeGuestToMember } from '@/lib/userRoleUtils';

interface QuoteDetail {
  id: string;
  status: string;
  payment_status?: string;
  total_price: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  departure_date: string;
  return_date: string;
  adult_count: number;
  child_count: number;
  infant_count: number;
  cruise_name?: string;
  manager_note?: string;
  users?: {
    name: string;
    email: string;
    phone_number?: string;
  };
  // 서비스 테이블 (견적 룸 제거됨)
  rentcar?: any[];
  cruise?: any[];
  airport?: any[];
  hotel?: any[];
  tour?: any[];
}

export default function QuoteDetailPage() {
  const router = useRouter();
  const params = useParams();
  const quoteId = (
    Array.isArray((params as any)?.id)
      ? (params as any).id[0]
      : (params as any)?.id
  ) as string;

  const handleGoHome = () => {
    router.push('/mypage');
  };

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detailedServices, setDetailedServices] = useState<any>({});

  const pickDisplay = (...values: any[]) => {
    for (const value of values) {
      if (value === 0) return '0';
      if (value === null || value === undefined) continue;
      if (typeof value === 'string' && value.trim() === '') continue;
      return String(value);
    }
    return '-';
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user && quoteId) {
      loadQuoteDetail();
      loadDetailedServices();
    }
  }, [user, quoteId]);

  const checkAuth = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        alert('로그인이 필요합니다.');
        router.push('/login');
        return;
      }

      // 게스트 권한 허용 (users 테이블에 등록되지 않은 사용자도 접근 가능)
      console.log('✅ 사용자 인증 성공 (guest 포함):', user.id);
      setUser(user);
    } catch (error) {
      console.error('❌ 인증 확인 오류:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleReservation = async () => {
    if (!user || !quote?.id) return;
    try {
      // 1. 게스트를 멤버로 승격 시도
      const upgradeResult = await upgradeGuestToMember(user.id, user.email);
      if (!upgradeResult.success && upgradeResult.error) {
        console.error('권한 업그레이드 실패:', upgradeResult.error);
        alert('예약 권한 설정 중 오류가 발생했습니다.');
        return;
      }
      // 2. 예약 페이지로 이동 (견적 ID 포함)
      router.push(`/mypage/reservations?quoteId=${quote.id}`);
    } catch (error) {
      console.error('예약 처리 중 오류:', error);
      alert('예약 처리 중 오류가 발생했습니다.');
    }
  };

  const loadQuoteDetail = async () => {
    try {
      console.log('📋 견적 상세 정보 로딩 시작...', quoteId);

      // 견적 기본 정보 조회
      const { data: quoteData, error: quoteError } = await supabase
        .from('quote')
        .select('*, payment_status')
        .eq('id', quoteId)
        .single();

      if (quoteError) {
        console.error('❌ 견적 조회 실패:', quoteError);
        alert('견적을 찾을 수 없습니다.');
        router.push('/manager/quotes');
        return;
      }

      console.log('✅ 견적 기본 정보:', quoteData);

      // 사용자 정보 조회 (안전한 방식)
      let userData = null;
      try {
        const { data: userResult, error: userError } = await supabase
          .from('users')
          .select('id, name, email, phone_number')
          .eq('id', quoteData.user_id)
          .single();

        if (userError) {
          console.warn('⚠️ 사용자 정보 조회 실패:', userError);
        } else {
          userData = userResult;
        }
      } catch (userErr) {
        console.warn('⚠️ 사용자 정보 조회 예외:', userErr);
      }

      console.log('👤 사용자 정보:', userData);

      // quote_item을 통한 서비스 데이터 조회 (quote_room 제거)
      const serviceQueries = await Promise.allSettled([
        supabase
          .from('quote_item')
          .select('*')
          .eq('quote_id', quoteId)
          .eq('service_type', 'rentcar'),
        supabase
          .from('quote_item')
          .select('*')
          .eq('quote_id', quoteId)
          .eq('service_type', 'cruise'),
        supabase
          .from('quote_item')
          .select('*')
          .eq('quote_id', quoteId)
          .eq('service_type', 'airport'),
        supabase
          .from('quote_item')
          .select('*')
          .eq('quote_id', quoteId)
          .eq('service_type', 'hotel'),
        supabase
          .from('quote_item')
          .select('*')
          .eq('quote_id', quoteId)
          .eq('service_type', 'tour')
      ]);

      console.log('🔍 각 서비스별 quote_item 조회 상태:');
      serviceQueries.forEach((result, index) => {
        const tableNames = ['rentcar(quote_item)', 'cruise(quote_item)', 'airport(quote_item)', 'hotel(quote_item)', 'tour(quote_item)'];
        console.log(`  ${tableNames[index]}: ${result.status}`);
        if (result.status === 'rejected') {
          console.log(`    에러:`, result.reason);
        }
      });

      // 결과 처리 및 상세 로깅

      // serviceQueries 인덱스 매핑 (quote_room 제거 후 재배치)
      // [0]=rentcar(items), [1]=cruise(items), [2]=airport(items), [3]=hotel(items), [4]=tour(items)
      const rentcarItems = serviceQueries[0].status === 'fulfilled' ? (serviceQueries[0].value.data || []) : [];
      const cruiseItems = serviceQueries[1].status === 'fulfilled' ? (serviceQueries[1].value.data || []) : [];
      const airportItems = serviceQueries[2].status === 'fulfilled' ? (serviceQueries[2].value.data || []) : [];
      const hotelItems = serviceQueries[3].status === 'fulfilled' ? (serviceQueries[3].value.data || []) : [];
      const tourItems = serviceQueries[4].status === 'fulfilled' ? (serviceQueries[4].value.data || []) : [];

      // quote_item 데이터를 그대로 사용 (조인 없이)
      const carData = rentcarItems.map((item: any) => ({
        id: item.id,
        service_ref_id: item.service_ref_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        options: item.options,
        // 기본 필드들
        car_model: item.options?.car_model || '렌트카',
        pickup_date: item.options?.pickup_date || null,
        return_date: item.options?.return_date || null,
        pickup_location: item.options?.pickup_location || '미정',
        return_location: item.options?.return_location || '미정'
      }));

      const cruiseData = cruiseItems.map((item: any) => ({
        id: item.id,
        service_ref_id: item.service_ref_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        options: item.options,
        // 기본 필드들
        cruise_name: item.options?.cruise_name || '크루즈',
        departure_date: item.options?.departure_date || null,
        return_date: item.options?.return_date || null,
        departure_port: item.options?.departure_port || '미정'
      }));

      const airportData = airportItems.map((item: any) => ({
        id: item.id,
        service_ref_id: item.service_ref_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        options: item.options,
        // 기본 필드들
        service_type: item.options?.service_type || '공항 서비스',
        flight_number: item.options?.flight_number || '미정'
      }));

      const hotelData = hotelItems.map((item: any) => ({
        id: item.id,
        service_ref_id: item.service_ref_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        options: item.options,
        // 기본 필드들
        hotel_name: item.options?.hotel_name || '호텔',
        check_in_date: item.options?.check_in_date || null,
        check_out_date: item.options?.check_out_date || null
      }));

      const tourData = tourItems.map((item: any) => ({
        id: item.id,
        service_ref_id: item.service_ref_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        options: item.options,
        // 기본 필드들
        tour_name: item.options?.tour_name || '투어',
        tour_date: item.options?.tour_date || null,
        duration_hours: item.options?.duration_hours || null
      }));

      // 상세 에러 로깅 및 성공 여부 확인
      serviceQueries.forEach((result, index) => {
        const names = ['객실(quote_room)', '렌트카(rentcar)', '크루즈(cruise)', '공항(airport)', '호텔(hotel)', '투어(tour)'];
        if (result.status === 'rejected') {
          console.warn(`❌ ${names[index]} 테이블 조회 실패:`, result.reason);
          console.warn(`   - 에러 코드:`, result.reason?.code);
          console.warn(`   - 에러 메시지:`, result.reason?.message);
        } else {
          console.log(`✅ ${names[index]} 테이블 조회 성공:`, result.value.data?.length || 0, '건');
        }
      });

      // 데이터 상세 로깅
      console.log('📊 서비스별 데이터 요약:');
      console.log('🚗 렌트카 데이터:', carData?.length || 0, '건', carData);
      console.log('🚢 크루즈 데이터:', cruiseData?.length || 0, '건', cruiseData);
      console.log('✈️ 공항 서비스 데이터:', airportData?.length || 0, '건', airportData);
      console.log('🏨 호텔 데이터:', hotelData?.length || 0, '건', hotelData);
      console.log('🎯 투어 데이터:', tourData?.length || 0, '건', tourData);

      const detailedQuote: QuoteDetail = {
        ...quoteData,
        users: userData || { name: '알 수 없음', email: '미확인', phone_number: '미확인' },
        rentcar: carData || [],
        cruise: cruiseData || [],
        airport: airportData || [],
        hotel: hotelData || [],
        tour: tourData || []
      };

      console.log('✅ 견적 상세 정보 로드 완료:', detailedQuote);
      setQuote(detailedQuote);

    } catch (error) {
      console.error('❌ 견적 상세 정보 로드 실패:', error);
      alert('견적 정보를 불러오는데 실패했습니다.');
      router.push('/manager/quotes');
    }
  };

  // 상세 서비스 정보 로드
  const loadDetailedServices = async () => {
    try {
      console.log('🔍 상세 서비스 정보 로드 시작...', quoteId);

      const { data: quoteItems, error } = await supabase
        .from('quote_item')
        .select('*')
        .eq('quote_id', quoteId);

      if (error) throw error;

      console.log('📋 Quote Items 로드됨:', quoteItems);

      const detailed: any = {
        rooms: [],
        cars: [],
        airports: [],
        hotels: [],
        rentcars: [],
        tours: []
      };

      for (const item of quoteItems || []) {
        try {
          console.log(`🔍 처리 중: ${item.service_type} (ref_id: ${item.service_ref_id})`);

          if (item.service_type === 'room') {
            const { data: roomData } = await supabase
              .from('room')
              .select('*')
              .eq('id', item.service_ref_id)
              .single();

            if (roomData) {
              console.log('✅ 객실 정보:', roomData);
              const roomPriceCode = item.options?.room_price_code || roomData.room_price_code || roomData.room_code;

              // room_price_code(=cruise_rate_card.id) 우선 조회
              const { data: primaryRoomPrice } = roomPriceCode ? await supabase
                .from('cruise_rate_card')
                .select('*')
                .eq('id', roomPriceCode)
                .maybeSingle() : { data: null };

              const priceData = primaryRoomPrice ? [primaryRoomPrice] : [];

              // 수량 업데이트 - 인원수를 quantity로 설정 (DB 컬럼 person_count 사용)
              const actualQuantity = roomData.person_count || 1;

              detailed.rooms.push({
                ...item,
                roomInfo: roomData,
                priceInfo: priceData || [],
                displayQuantity: actualQuantity // 표시용 수량
              });
            }
          } else if (item.service_type === 'car') {
            const { data: carData } = await supabase
              .from('car')
              .select('*')
              .eq('id', item.service_ref_id)
              .single();

            if (carData) {
              console.log('✅ 차량 정보:', carData);
              const carPriceCode = item.options?.car_price_code || carData.car_price_code || carData.car_code;
              const { data: priceData } = await supabase
                .from('rentcar_price')
                .select('*')
                .eq('rent_code', carPriceCode);

              // 수량 업데이트 - 차량 수를 quantity로 설정
              const actualQuantity = carData.car_count || 1;

              detailed.cars.push({
                ...item,
                carInfo: carData,
                priceInfo: priceData || [],
                displayQuantity: actualQuantity // 표시용 수량
              });
            }
          } else if (item.service_type === 'airport') {
            const { data: airportData } = await supabase
              .from('airport')
              .select('*')
              .eq('id', item.service_ref_id)
              .single();

            if (airportData) {
              console.log('✅ 공항 정보:', airportData);
              const airportPriceCode = item.options?.airport_price_code || airportData.airport_price_code || airportData.airport_code;
              const { data: priceData } = await supabase
                .from('airport_price')
                .select('*')
                .eq('airport_code', airportPriceCode);

              // 공항 서비스 표시는 승객수가 아닌 차량수 기준으로 고정
              const actualQuantity = item.quantity || 1;

              detailed.airports.push({
                ...item,
                airportInfo: airportData,
                priceInfo: priceData || [],
                displayQuantity: actualQuantity // 표시용 수량
              });
            }
          } else if (item.service_type === 'hotel') {
            const { data: hotelData } = await supabase
              .from('hotel')
              .select('*')
              .eq('id', item.service_ref_id)
              .single();

            if (hotelData) {
              console.log('✅ 호텔 정보:', hotelData);
              const hotelPriceCode = item.options?.hotel_price_code || hotelData.hotel_price_code;
              const hotelCode = hotelData.hotel_code || item.options?.hotel_code;

              const { data: primaryHotelPrices } = hotelPriceCode ? await supabase
                .from('hotel_price')
                .select('*')
                .eq('hotel_price_code', hotelPriceCode)
                : { data: [] };

              const { data: fallbackHotelPrices } = (!primaryHotelPrices || primaryHotelPrices.length === 0) && hotelCode ? await supabase
                .from('hotel_price')
                .select('*')
                .eq('hotel_code', hotelCode)
                : { data: [] };

              const priceData = (primaryHotelPrices && primaryHotelPrices.length > 0)
                ? primaryHotelPrices
                : (fallbackHotelPrices || []);

              // 수량 업데이트 - 객실 수를 quantity로 설정
              const actualQuantity = hotelData.room_count || 1;

              detailed.hotels.push({
                ...item,
                hotelInfo: hotelData,
                priceInfo: priceData || [],
                displayQuantity: actualQuantity // 표시용 수량
              });
            }
          } else if (item.service_type === 'rentcar') {
            const { data: rentcarData } = await supabase
              .from('rentcar')
              .select('*')
              .eq('id', item.service_ref_id)
              .single();

            if (rentcarData) {
              console.log('✅ 렌트카 정보:', rentcarData);
              const rentcarPriceCode = item.options?.rentcar_price_code || rentcarData.rentcar_price_code || rentcarData.rentcar_code;
              const { data: priceData } = await supabase
                .from('rentcar_price')
                .select('*')
                .eq('rent_code', rentcarPriceCode);

              // 수량 업데이트 - 차량 수를 quantity로 설정
              const actualQuantity = rentcarData.vehicle_count || item.quantity || 1;

              detailed.rentcars.push({
                ...item,
                rentcarInfo: rentcarData,
                priceInfo: priceData || [],
                displayQuantity: actualQuantity // 표시용 수량
              });
            }
          } else if (item.service_type === 'tour') {
            let tourData: any = null;

            // ✅ tour 테이블의 PK는 tour_id (id가 아님)
            const { data: byTourId } = await supabase
              .from('tour')
              .select('*')
              .eq('tour_id', item.service_ref_id)
              .maybeSingle();

            if (byTourId) {
              tourData = byTourId;
            } else {
              // 폴백: id로도 시도 (데이터 구조 변경 대비)
              const { data: byId } = await supabase
                .from('tour')
                .select('*')
                .eq('id', item.service_ref_id)
                .maybeSingle();
              tourData = byId;
            }

            if (tourData) {
              console.log('✅ 투어 정보:', tourData);
              const { data: priceData } = await supabase
                .from('tour_pricing')
                .select('*, tour:tour_id(tour_name, tour_code)')
                .eq('tour_id', tourData.tour_id || tourData.id);

              // 수량 업데이트 - 참가자 수를 quantity로 설정
              const actualQuantity = tourData.participant_count || 1;

              detailed.tours.push({
                ...item,
                tourInfo: tourData,
                priceInfo: priceData || [],
                displayQuantity: actualQuantity // 표시용 수량
              });
            }
          }
        } catch (serviceError) {
          console.warn(`⚠️ ${item.service_type} 상세 정보 로드 실패:`, serviceError);
        }
      }

      setDetailedServices(detailed);
      console.log('✅ 상세 서비스 정보 로드 완료:', detailed);
    } catch (error) {
      console.error('❌ 상세 서비스 정보 로드 실패:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: 'bg-yellow-50 text-yellow-600',
      submitted: 'bg-yellow-50 text-yellow-600',
      draft: 'bg-gray-50 text-gray-600',
      confirmed: 'bg-blue-50 text-blue-600',
      approved: 'bg-blue-50 text-blue-600',
      rejected: 'bg-red-50 text-red-600'
    };
    const labels = {
      pending: '검토 대기',
      submitted: '제출됨',
      draft: '임시저장',
      confirmed: '확정됨 (예약)',
      approved: '승인됨',
      rejected: '거절됨'
    };
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badges[status as keyof typeof badges] || 'bg-gray-50 text-gray-600'}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    );
  };

  const handleSubmitQuote = async () => {
    if (!quote?.id || submitting) return;
    setSubmitting(true);

    let submitSuccess = false;

    try {
      // 0. 사전 행 존재 및 권한 점검
      const { data: existingRow, error: preError } = await supabase
        .from('quote')
        .select('id,user_id,status,submitted_at')
        .eq('id', quote.id)
        .maybeSingle();

      if (preError) {
        console.warn('⚠️ 사전 조회 실패:', preError);
      }
      if (!existingRow) {
        alert('견적 행을 찾을 수 없습니다. (삭제되었거나 권한 제한)');
        setSubmitting(false);
        return;
      }
      const authUser = user; // 이미 checkAuth로 설정됨
      if (existingRow.user_id && authUser?.id && existingRow.user_id !== authUser.id) {
        // RLS에서 owner 조건 가능성 안내
        console.warn('⚠️ 제출자와 견적 소유자 불일치:', { owner: existingRow.user_id, me: authUser.id });
      }

      // 견적 제출 payload - status와 submitted_at만 업데이트
      const payload = {
        status: 'submitted',
        submitted_at: new Date().toISOString()
      };

      console.log('📤 견적 제출 시도:', { quoteId: quote.id, payload });

      // id 기준 업데이트 - 최소한의 컬럼만 업데이트하여 트리거 오류 최소화
      const { data, error } = await supabase
        .from('quote')
        .update(payload)
        .eq('id', quote.id)
        .select('id')
        .single();

      console.log('📥 견적 제출 응답:', { data, error });

      if (error) {
        // 에러 상세 로깅
        console.error('❌ 견적 제출 업데이트 실패 상세:', {
          code: (error as any)?.code,
          message: (error as any)?.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
          fullError: error
        });

        const msg = (error as any)?.message || '';
        let extraHint = '';

        // quote_id 컬럼 오류 특별 처리
        if (msg.includes('quote_id') || msg.includes('column')) {
          extraHint = '\n⚠️ 데이터베이스 구조 문제: quote_id 컬럼이 존재하지 않습니다.\n관리자에게 문의하세요.';
          // 개발자용 추가 정보
          console.error('💡 해결 방법: 데이터베이스 트리거/함수에서 quote_id 참조를 id로 변경 필요');
        } else if (msg.match(/violates row-level security|permission denied/i)) {
          extraHint = '\n⚠️ 권한(RLS) 문제 가능성: 견적 소유자 또는 관리자/매니저 계정으로 다시 시도하세요.';
        } else if (msg.match(/invalid input value|enum|constraint|status/i)) {
          extraHint = '\n⚠️ status 값 또는 제약 조건 위반 가능성: status="submitted" 허용 여부 확인.';
        }

        alert(`견적 제출 중 오류가 발생했습니다.\n${msg}${extraHint}`);
        setSubmitting(false);
        return;
      }

      // 견적 제출 성공!
      submitSuccess = true;
      alert('견적이 성공적으로 제출되었습니다!');

    } catch (err: any) {
      console.error('❌ 견적 제출 예외:', err);
      alert(`견적 제출 중 오류가 발생했습니다.\n${err?.message || ''}`);
      setSubmitting(false);
      return;
    }

    // 견적 제출이 성공한 경우에만 알림 시도 (비동기, 실패해도 무관)
    if (submitSuccess) {
      // TODO: RPC 함수가 quote_id 컬럼을 참조하므로 현재 비활성화
      // DB 함수를 수정하여 id 컬럼을 사용하도록 변경 후 다시 활성화 필요
      /*
      setTimeout(async () => {
        try {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            await supabase.rpc('create_quote_approval_notification', {
              p_quote_id: quote.id,
              p_user_id: authUser.id
            });
          }
        } catch (notificationError: any) {
          console.warn('⚠️ 알림 생성 실패 (무시됨):', notificationError?.message || notificationError);
        }
      }, 100);
      */

      setSubmitting(false);
      router.push('/mypage/quotes');
    }
  };

  if (loading || !quote) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">견적 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/mypage/quotes')}
                className="p-2 text-black hover:text-black font-bold text-lg"
              >
                <span className="font-extrabold text-xl text-black">←</span>
              </button>
              <h1 className="text-xl font-bold text-gray-700">📋 {quote.cruise_name || '견적 상세'}</h1>
              {getStatusBadge(quote.status)}
            </div>

            {/* 액션 버튼들 - 헤더로 이동 */}
            <div className="flex gap-4">
              <button
                onClick={handleGoHome}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded text-xs hover:bg-gray-50 transition-colors"
              >
                🏠 홈으로
              </button>

              {quote?.status !== 'approved' && (
                <button
                  onClick={handleSubmitQuote}
                  className="bg-green-300 text-black px-4 py-2 rounded text-xs hover:bg-green-400 transition-colors font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={submitting}
                >
                  📝 견적 제출
                </button>
              )}

              {quote?.payment_status === 'paid' && (
                <button
                  onClick={() => {
                    const confirmationUrl = `/customer/confirmation?quote_id=${quote.id}&token=customer`;
                    window.open(confirmationUrl, '_blank');
                  }}
                  className="bg-blue-500 text-white px-4 py-2 rounded text-xs hover:bg-blue-600 transition-colors font-bold shadow-sm"
                >
                  📄 예약확인서 보기
                </button>
              )}

              {quote?.status !== 'approved' && quote?.payment_status !== 'paid' && (quote?.total_price || 0) > 0 && (
                <button
                  onClick={() => router.push('/mypage/payments')}
                  className="bg-yellow-500 text-white px-4 py-2 rounded text-xs hover:bg-yellow-600 transition-colors font-bold shadow-sm"
                >
                  💳 결제하기
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 안내 문구 */}
      <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <span className="text-blue-400">💡</span>
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-700">
              내역을 확인 하시고 견적제출을 클릭하시면 빠른 답변 드리겠습니다. ^^
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 gap-8">
          {/* 메인 콘텐츠 */}
          <div className="space-y-6">
            {/* 고객 정보 */}
            <div className="bg-white shadow-sm rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-600 mb-4">👤 고객 정보</h2>
              <table className="min-w-full text-sm text-gray-600 border border-blue-100">
                <tbody>
                  <tr>
                    <td className="px-2 py-1 font-medium border-blue-100 border bg-gray-25 w-32">닉네임</td>
                    <td className="px-2 py-1 border-blue-100 border">{quote.users?.name || '정보 없음'}</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1 font-medium border-blue-100 border bg-gray-25">이메일</td>
                    <td className="px-2 py-1 border-blue-100 border">{quote.users?.email || '정보 없음'}</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1 font-medium border-blue-100 border bg-gray-25">연락처</td>
                    <td className="px-2 py-1 border-blue-100 border">{quote.users?.phone_number || '정보 없음'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 상세 서비스 정보 섹션 */}
            {/* 객실 정보 */}
            {detailedServices.rooms && detailedServices.rooms.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-amber-50/40 shadow-sm p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-700">🛏 객실 정보 (상세)</h2>
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                    {detailedServices.rooms.length}개 선택
                  </span>
                </div>
                <div className="space-y-4">
                  {detailedServices.rooms.map((room: any, index: number) => (
                    <div key={index} className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                      <table className="min-w-full text-sm text-slate-700 border border-slate-100 rounded-lg overflow-hidden">
                        <tbody>
                          {(room.priceInfo && room.priceInfo.length > 0 ? room.priceInfo : [{}]).map((price: any, priceIndex: number) => (
                            <React.Fragment key={priceIndex}>
                              <tr className="bg-slate-50/70">
                                <td className="px-3 py-2 font-medium border-slate-100 border w-36">일정</td>
                                <td className="px-3 py-2 border-slate-100 border">
                                  {pickDisplay(price.schedule, price.schedule_type, room.roomInfo?.schedule, room.options?.schedule)}
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-medium border-slate-100 border">크루즈</td>
                                <td className="px-3 py-2 border-slate-100 border">
                                  {pickDisplay(price.cruise, price.cruise_name, room.roomInfo?.cruise_name, room.options?.cruise_name)}
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-medium border-slate-100 border">객실 타입</td>
                                <td className="px-3 py-2 border-slate-100 border">
                                  {pickDisplay(price.room_type, room.roomInfo?.room_type, room.options?.room_type)}
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-medium border-slate-100 border">카테고리</td>
                                <td className="px-3 py-2 border-slate-100 border">
                                  {pickDisplay(price.room_category, price.category, room.roomInfo?.room_category, room.options?.room_category, room.roomInfo?.category)}
                                </td>
                              </tr>
                              <tr className="bg-amber-50/50">
                                <td className="px-3 py-2 font-medium border-slate-100 border">인원수</td>
                                <td className="px-3 py-2 border-slate-100 border">{pickDisplay(room.roomInfo?.person_count)}명</td>
                              </tr>

                              {/* 추가수 / 추가 요금 행 제거됨 */}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 차량 정보 */}
            {detailedServices.cars && detailedServices.cars.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-cyan-50/40 shadow-sm p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-700">🚗 차량 정보 (상세)</h2>
                  <span className="inline-flex items-center rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-700">
                    {detailedServices.cars.length}개 선택
                  </span>
                </div>
                <div className="space-y-4">
                  {detailedServices.cars.map((car: any, index: number) => (
                    <div key={index} className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                      <table className="min-w-full text-sm text-slate-700 border border-slate-100 rounded-lg overflow-hidden">
                        <tbody>
                          {(car.priceInfo && car.priceInfo.length > 0 ? car.priceInfo : [{}]).map((price: any, priceIndex: number) => (
                            <React.Fragment key={priceIndex}>
                              <tr className="bg-slate-50/70">
                                <td className="px-3 py-2 font-medium border-slate-100 border w-36">일정</td>
                                <td className="px-3 py-2 border-slate-100 border">
                                  {pickDisplay(price.schedule, car.carInfo?.schedule, car.options?.schedule)}
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-medium border-slate-100 border">크루즈</td>
                                <td className="px-3 py-2 border-slate-100 border">
                                  {pickDisplay(price.cruise, car.carInfo?.cruise, car.options?.cruise)}
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-medium border-slate-100 border">차량 타입</td>
                                <td className="px-3 py-2 border-slate-100 border">
                                  {pickDisplay(price.car_type, car.carInfo?.car_type, car.options?.car_type)}
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-medium border-slate-100 border">카테고리</td>
                                <td className="px-3 py-2 border-slate-100 border">
                                  {pickDisplay(price.car_category, car.carInfo?.car_category, car.options?.car_category)}
                                </td>
                              </tr>
                              {/* 차량 타입이 셔틀을 포함할 경우: 차량수가 아닌 인원수 표기 (단, 셔틀 단독은 차량수) */}
                              {(() => {
                                const type = (price.car_type || '').toLowerCase();
                                const isShuttle = type.includes('셔틀') || type.includes('shuttle');
                                // 셔틀 단독 여부 판단: 타입 문자열이 셔틀 관련 키워드만으로 구성된 경우
                                const shuttleOnly = isShuttle && /^(셔틀|shuttle)(\s*버스)?$/i.test(type.trim());
                                if (isShuttle && !shuttleOnly) {
                                  // 인원수 표시 (person_count, passenger_count 우선 순위)
                                  const passengerCount = car.carInfo?.passenger_count || car.carInfo?.person_count || car.carInfo?.car_count || 0;
                                  return (
                                    <tr className="bg-gray-50">
                                      <td className="px-3 py-2 font-medium border-slate-100 border">인원수</td>
                                      <td className="px-3 py-2 border-slate-100 border">{passengerCount}인</td>
                                    </tr>
                                  );
                                }
                                // 기본: 차량수 표시
                                return (
                                  <tr className="bg-cyan-50/50">
                                    <td className="px-3 py-2 font-medium border-slate-100 border">차량수</td>
                                    <td className="px-3 py-2 border-slate-100 border">{pickDisplay(car.carInfo?.car_count)}대</td>
                                  </tr>
                                );
                              })()}
                              {/* 추가 요금 행 제거됨 */}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 공항 서비스 정보 */}
            {detailedServices.airports && detailedServices.airports.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50/50 shadow-sm p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-700">✈️ 공항 서비스 (상세)</h2>
                  <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                    {detailedServices.airports.length}개 선택
                  </span>
                </div>
                <div className="space-y-4">
                  {detailedServices.airports.map((airport: any, index: number) => (
                    <div key={index} className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                      <table className="min-w-full text-sm text-slate-700 border border-slate-100 rounded-lg overflow-hidden">
                        <tbody>
                          {(airport.priceInfo && airport.priceInfo.length > 0 ? airport.priceInfo : [{}]).map((price: any, priceIndex: number) => (
                            <React.Fragment key={priceIndex}>
                              <tr className="bg-slate-50/70">
                                <td className="px-3 py-2 font-medium border-slate-100 border w-36">카테고리</td>
                                <td className="px-3 py-2 border-slate-100 border">
                                  {pickDisplay(price.airport_category, price.service_type, airport.airportInfo?.airport_category, airport.options?.service_type)}
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-medium border-slate-100 border">경로</td>
                                <td className="px-3 py-2 border-slate-100 border">
                                  {pickDisplay(price.airport_route, price.route, airport.airportInfo?.airport_route, airport.options?.route)}
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-medium border-slate-100 border">차량 타입</td>
                                <td className="px-3 py-2 border-slate-100 border">
                                  {pickDisplay(price.airport_car_type, price.vehicle_type, airport.airportInfo?.airport_car_type, airport.options?.vehicle_type)}
                                </td>
                              </tr>
                              <tr className="bg-sky-50/60">
                                <td className="px-3 py-2 font-medium border-slate-100 border">차량수</td>
                                <td className="px-3 py-2 border-slate-100 border">{pickDisplay(airport.displayQuantity, airport.quantity, 1)}대</td>
                              </tr>
                              {/* 추가 요금 행 제거됨 */}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 호텔 정보 */}
            {detailedServices.hotels && detailedServices.hotels.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 shadow-sm p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-700">🏨 호텔 정보 (상세)</h2>
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {detailedServices.hotels.length}개 선택
                  </span>
                </div>
                <div className="space-y-4">
                  {detailedServices.hotels.map((hotel: any, index: number) => (
                    <div key={index} className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                      <table className="min-w-full text-sm text-slate-700 border border-slate-100 rounded-lg overflow-hidden">
                        <tbody>
                          {(hotel.priceInfo && hotel.priceInfo.length > 0 ? hotel.priceInfo : [{}]).map((price: any, priceIndex: number) => (
                            <React.Fragment key={priceIndex}>
                              <tr className="bg-slate-50/70">
                                <td className="px-3 py-2 font-medium border-slate-100 border w-36">호텔명</td>
                                <td className="px-3 py-2 border-slate-100 border">
                                  {pickDisplay(
                                    (typeof price.hotel_info === 'object' ? price.hotel_info?.hotel_name : price.hotel_name),
                                    hotel.hotelInfo?.hotel_name,
                                    hotel.options?.hotel_name
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-medium border-slate-100 border">객실명</td>
                                <td className="px-3 py-2 border-slate-100 border">
                                  {pickDisplay(
                                    (typeof price.room_type === 'object' ? price.room_type?.room_name : price.room_name),
                                    hotel.hotelInfo?.room_name,
                                    hotel.options?.room_name
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-medium border-slate-100 border">객실 타입</td>
                                <td className="px-3 py-2 border-slate-100 border">
                                  {pickDisplay(
                                    (typeof price.room_type === 'object' ? price.room_type?.room_category : price.room_type),
                                    price.room_category,
                                    hotel.hotelInfo?.room_type,
                                    hotel.options?.room_type
                                  )}
                                </td>
                              </tr>
                              <tr className="bg-emerald-50/60">
                                <td className="px-3 py-2 font-medium border-slate-100 border">객실수</td>
                                <td className="px-3 py-2 border-slate-100 border">{pickDisplay(hotel.displayQuantity, hotel.quantity, 1)}개</td>
                              </tr>
                              {/* 추가 요금 행 제거됨 */}

                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 렌트카 정보 */}
            {detailedServices.rentcars && detailedServices.rentcars.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-orange-50/40 shadow-sm p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-700">🚙 렌트카 정보 (상세)</h2>
                  <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                    {detailedServices.rentcars.length}개 선택
                  </span>
                </div>
                <div className="space-y-4">
                  {detailedServices.rentcars.map((rentcar: any, index: number) => (
                    <div key={index} className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                      <table className="min-w-full text-sm text-slate-700 border border-slate-100 rounded-lg overflow-hidden">
                        <tbody>
                          {(rentcar.priceInfo && rentcar.priceInfo.length > 0 ? rentcar.priceInfo : [{}]).map((price: any, priceIndex: number) => (
                            <React.Fragment key={priceIndex}>
                              <tr className="bg-slate-50/70">
                                <td className="px-3 py-2 font-medium border-slate-100 border w-36">이용방식</td>
                                <td className="px-3 py-2 border-slate-100 border">{pickDisplay(price.way_type, rentcar.options?.way_type)}</td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-medium border-slate-100 border">경로</td>
                                <td className="px-3 py-2 border-slate-100 border">{pickDisplay(price.route, rentcar.options?.route)}</td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-medium border-slate-100 border">차량 종류</td>
                                <td className="px-3 py-2 border-slate-100 border">{pickDisplay(price.vehicle_type, rentcar.options?.vehicle_type)}</td>
                              </tr>
                              <tr className="bg-orange-50/60">
                                <td className="px-3 py-2 font-medium border-slate-100 border">수량</td>
                                <td className="px-3 py-2 border-slate-100 border">{pickDisplay(rentcar.displayQuantity, rentcar.quantity, 1)}대</td>
                              </tr>
                              {/* 추가 요금 행 제거됨 */}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 투어 정보 */}
            {detailedServices.tours && detailedServices.tours.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-rose-50/40 shadow-sm p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-700">🎯 투어 정보 (상세)</h2>
                  <span className="inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                    {detailedServices.tours.length}개 선택
                  </span>
                </div>
                <div className="space-y-4">
                  {detailedServices.tours.map((tour: any, index: number) => (
                    <div key={index} className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                      <table className="min-w-full text-sm text-slate-700 border border-slate-100 rounded-lg overflow-hidden">
                        <tbody>
                          {(tour.priceInfo && tour.priceInfo.length > 0 ? tour.priceInfo : [{}]).map((price: any, priceIndex: number) => (
                            <React.Fragment key={priceIndex}>
                              <tr className="bg-slate-50/70">
                                <td className="px-3 py-2 font-medium border-slate-100 border w-36">투어명</td>
                                <td className="px-3 py-2 border-slate-100 border">{pickDisplay(price.tour_name, price.tour?.tour_name, tour.tourInfo?.tour_name, tour.options?.tour_name)}</td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-medium border-slate-100 border">최대 인원수</td>
                                <td className="px-3 py-2 border-slate-100 border">{pickDisplay(price.tour_capacity, price.max_guests)}명</td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-medium border-slate-100 border">차량</td>
                                <td className="px-3 py-2 border-slate-100 border">{pickDisplay(price.tour_vehicle, price.vehicle_type, tour.options?.vehicle_type)}</td>
                              </tr>
                              <tr className="bg-rose-50/60">
                                <td className="px-3 py-2 font-medium border-slate-100 border">투어 날짜</td>
                                <td className="px-3 py-2 border-slate-100 border">{pickDisplay(tour.tourInfo?.tour_date, tour.options?.tour_date)}</td>
                              </tr>
                              <tr className="bg-rose-50/60">
                                <td className="px-3 py-2 font-medium border-slate-100 border">차량수</td>
                                <td className="px-3 py-2 border-slate-100 border">{pickDisplay(tour.displayQuantity, tour.quantity, tour.tourInfo?.participant_count, 1)}대</td>
                              </tr>
                              {/* 추가 요금 행 제거됨 */}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}



            {/* 기본 견적 정보 완료 */}
          </div>
        </div>
      </div>
    </div>
  );
}
