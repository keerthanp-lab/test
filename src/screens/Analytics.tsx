import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import LogInContext from '../context/LoginContext';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';
import type { PersonalExpense } from '../types';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const START_YEAR = 2024;
const START_MONTH = 8; // August

type Mode = 'monthly' | 'yearly';

// ─── date parser (handles Timestamp, YYYY-MM-DD, DD-MM-YYYY, etc.) ────────────

const parseAnyDate = (raw: any): Date | null => {
  if (!raw) return null;
  if (typeof raw === 'object' && typeof raw.toDate === 'function') return raw.toDate();
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s + 'T00:00:00');
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) return new Date(`${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}T00:00:00`);
  const f = new Date(s);
  return isNaN(f.getTime()) ? null : f;
};

// ─── Bar chart (pure RN) ──────────────────────────────────────────────────────

interface BarPoint { value: number; label: string }

const BarChart: React.FC<{ data: BarPoint[] }> = ({ data }) => {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const CHART_H = 140;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: CHART_H + 4 }}>
          {data.map((d, i) => {
            const barH = d.value > 0 ? Math.max((d.value / maxVal) * CHART_H, 4) : 0;
            const isTop = d.value === maxVal && d.value > 0;
            return (
              <View key={i} style={bc.col}>
                {d.value > 0 && (
                  <Text style={bc.valLabel} numberOfLines={1}>
                    {d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}k` : d.value.toFixed(0)}
                  </Text>
                )}
                <View
                  style={[
                    bc.bar,
                    {
                      height: barH,
                      backgroundColor: isTop ? Colors.negativeRed : Colors.primary,
                      opacity: d.value === 0 ? 0.12 : 1,
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
        <View style={bc.baseline} />
        <View style={{ flexDirection: 'row' }}>
          {data.map((d, i) => (
            <Text key={i} style={bc.xLabel}>{d.label}</Text>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

const bc = StyleSheet.create({
  col: { width: 30, alignItems: 'center', justifyContent: 'flex-end', marginHorizontal: 2 },
  bar: { width: 20, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  baseline: { height: 1, backgroundColor: Colors.border, marginTop: 2 },
  xLabel: { width: 34, fontSize: 8, color: Colors.textSecondary, textAlign: 'center', marginTop: 3 },
  valLabel: { fontSize: 7, color: Colors.textSecondary, marginBottom: 2 },
});

// ─── Main component ───────────────────────────────────────────────────────────

const Analytics: React.FC = () => {
  const { firebase } = useContext(LogInContext);

  const [userId, setUserId] = useState('');
  const [expenses, setExpenses] = useState<PersonalExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [mode, setMode] = useState<Mode>('monthly');
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  useEffect(() => {
    firebase.getCurrentUser().then(u => { if (u) setUserId(u.uid); });
  }, []);

  useEffect(() => {
    if (!userId) return;
    const unsub = firestore()
      .collection('personal')
      .where('userId', '==', userId)
      .onSnapshot(snap => {
        setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as PersonalExpense)));
        setLoading(false);
      });
    return unsub;
  }, [userId]);

  // ─── navigation bounds ───────────────────────────────────────────────────────

  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;

  const atMonthStart = selectedYear === START_YEAR && selectedMonth === START_MONTH;
  const atMonthEnd = selectedYear === curYear && selectedMonth === curMonth;
  const atYearStart = selectedYear === START_YEAR;
  const atYearEnd = selectedYear === curYear;

  const prevMonth = () => {
    if (atMonthStart) return;
    if (selectedMonth === 1) { setSelectedYear(y => y - 1); setSelectedMonth(12); }
    else setSelectedMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (atMonthEnd) return;
    if (selectedMonth === 12) { setSelectedYear(y => y + 1); setSelectedMonth(1); }
    else setSelectedMonth(m => m + 1);
  };
  const prevYear = () => { if (!atYearStart) setSelectedYear(y => y - 1); };
  const nextYear = () => { if (!atYearEnd) setSelectedYear(y => y + 1); };

  // ─── filter expenses to selected period ──────────────────────────────────────

  const periodExpenses = useMemo(() => {
    return expenses.filter(e => {
      const d = parseAnyDate(e.date);
      if (!d) return false;
      if (mode === 'monthly') {
        return d.getFullYear() === selectedYear && d.getMonth() + 1 === selectedMonth;
      }
      return d.getFullYear() === selectedYear;
    });
  }, [expenses, mode, selectedYear, selectedMonth]);

  // ─── bar chart data ──────────────────────────────────────────────────────────

  const chartData = useMemo((): BarPoint[] => {
    if (mode === 'monthly') {
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
      return Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const total = periodExpenses
          .filter(e => { const d = parseAnyDate(e.date); return d && d.getDate() === day; })
          .reduce((s, e) => s + (e.cost ?? 0), 0);
        return { value: Math.round(total * 100) / 100, label: day % 5 === 1 ? String(day) : '' };
      });
    }
    // yearly → monthly bars
    return MONTH_SHORT.map((label, i) => {
      const mo = i + 1;
      const total = periodExpenses
        .filter(e => { const d = parseAnyDate(e.date); return d && d.getMonth() + 1 === mo; })
        .reduce((s, e) => s + (e.cost ?? 0), 0);
      return { value: Math.round(total * 100) / 100, label };
    });
  }, [periodExpenses, mode, selectedYear, selectedMonth]);

  // ─── top 10 ──────────────────────────────────────────────────────────────────

  const top10 = useMemo(() => {
    const map: Record<string, number> = {};
    periodExpenses.forEach(e => {
      const name = (e.itemName ?? 'Unknown').trim();
      map[name] = (map[name] ?? 0) + (e.cost ?? 0);
    });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const topVal = sorted[0]?.[1] ?? 1;
    const grandTotal = periodExpenses.reduce((s, e) => s + (e.cost ?? 0), 0);
    return sorted.map(([name, total], i) => ({
      name,
      total: Math.round(total * 100) / 100,
      pct: Math.round((total / topVal) * 100),
      share: grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0,
      rank: i + 1,
    }));
  }, [periodExpenses]);

  const periodTotal = periodExpenses.reduce((s, e) => s + (e.cost ?? 0), 0);
  const periodLabel = mode === 'monthly'
    ? `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`
    : String(selectedYear);

  // ─── render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <View style={s.centered}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  }

  if (expenses.length === 0) {
    return (
      <View style={s.centered}>
        <Text style={s.emptyTitle}>No personal expenses yet</Text>
        <Text style={s.emptySub}>Add expenses in the Personal tab to see analytics.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>

      {/* Mode toggle */}
      <View style={s.modeToggle}>
        {(['monthly', 'yearly'] as Mode[]).map(m => (
          <TouchableOpacity
            key={m}
            style={[s.modeBtn, mode === m && s.modeBtnActive]}
            onPress={() => setMode(m)}
            activeOpacity={0.8}>
            <Text style={[s.modeTxt, mode === m && s.modeTxtActive]}>
              {m === 'monthly' ? 'Monthly' : 'Yearly'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Period navigator */}
      {mode === 'monthly' ? (
        <View style={s.nav}>
          <TouchableOpacity
            style={[s.navBtn, atMonthStart && s.navBtnOff]}
            onPress={prevMonth}
            disabled={atMonthStart}
            activeOpacity={0.7}>
            <Text style={[s.navArrow, atMonthStart && s.navArrowOff]}>&#8249;</Text>
          </TouchableOpacity>
          <Text style={s.navLabel}>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</Text>
          <TouchableOpacity
            style={[s.navBtn, atMonthEnd && s.navBtnOff]}
            onPress={nextMonth}
            disabled={atMonthEnd}
            activeOpacity={0.7}>
            <Text style={[s.navArrow, atMonthEnd && s.navArrowOff]}>&#8250;</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.nav}>
          <TouchableOpacity
            style={[s.navBtn, atYearStart && s.navBtnOff]}
            onPress={prevYear}
            disabled={atYearStart}
            activeOpacity={0.7}>
            <Text style={[s.navArrow, atYearStart && s.navArrowOff]}>&#8249;</Text>
          </TouchableOpacity>
          <Text style={s.navLabel}>{selectedYear}</Text>
          <TouchableOpacity
            style={[s.navBtn, atYearEnd && s.navBtnOff]}
            onPress={nextYear}
            disabled={atYearEnd}
            activeOpacity={0.7}>
            <Text style={[s.navArrow, atYearEnd && s.navArrowOff]}>&#8250;</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Summary banner */}
      <View style={s.banner}>
        <Text style={s.bannerLabel}>{periodLabel} Spend</Text>
        <Text style={s.bannerValue}>₹{periodTotal.toFixed(2)}</Text>
        <Text style={s.bannerSub}>{periodExpenses.length} expense entries</Text>
      </View>

      {/* Bar chart */}
      <View style={s.card}>
        <Text style={s.cardTitle}>
          {mode === 'monthly' ? 'Day-by-Day Breakdown' : 'Month-by-Month Breakdown'}
        </Text>
        {chartData.every(d => d.value === 0) ? (
          <Text style={s.noData}>No spend data for {periodLabel}.</Text>
        ) : (
          <BarChart data={chartData} />
        )}
      </View>

      {/* Top 10 items */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Top 10 Items — {periodLabel}</Text>
        {top10.length === 0 ? (
          <Text style={s.noData}>No expenses for {periodLabel}.</Text>
        ) : (
          top10.map(p => (
            <View key={p.name} style={s.itemRow}>
              <View style={[s.rank, p.rank === 1 && s.rankGold]}>
                <Text style={[s.rankTxt, p.rank === 1 && s.rankTxtGold]}>{p.rank}</Text>
              </View>
              <View style={s.itemInfo}>
                <View style={s.itemHeader}>
                  <Text style={s.itemName} numberOfLines={1}>{p.name}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.itemTotal}>₹{p.total.toFixed(2)}</Text>
                    <Text style={s.itemShare}>{p.share}% of total</Text>
                  </View>
                </View>
                <View style={s.barTrack}>
                  <View style={[s.barFill, { width: `${p.pct}%` }]} />
                </View>
              </View>
            </View>
          ))
        )}
      </View>

    </ScrollView>
  );
};

export default Analytics;

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  emptySub: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center' },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: 4,
    marginBottom: Spacing.md,
    elevation: 1,
    shadowColor: Colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  modeBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: BorderRadius.sm },
  modeBtnActive: { backgroundColor: Colors.primary },
  modeTxt: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  modeTxtActive: { color: Colors.white },

  // Navigator
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.xs,
    elevation: 1,
    shadowColor: Colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  navBtn: { padding: Spacing.md },
  navBtnOff: { opacity: 0.3 },
  navArrow: { fontSize: 28, color: Colors.primary, fontWeight: '300', lineHeight: 32 },
  navArrowOff: { color: Colors.grey },
  navLabel: { flex: 1, textAlign: 'center', fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },

  // Banner
  banner: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  bannerLabel: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  bannerValue: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.white, marginVertical: 4 },
  bannerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)' },

  // Card
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    elevation: 1,
    shadowColor: Colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  noData: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', paddingVertical: Spacing.xl },

  // Top 10 list
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, gap: Spacing.sm },
  rank: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.lightGrey,
    alignItems: 'center', justifyContent: 'center',
  },
  rankGold: { backgroundColor: '#FFD700' },
  rankTxt: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },
  rankTxtGold: { color: '#7a5800' },
  itemInfo: { flex: 1 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  itemName: { flex: 1, fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, paddingRight: Spacing.sm },
  itemTotal: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  itemShare: { fontSize: FontSize.xs, color: Colors.textSecondary },
  barTrack: { height: 7, backgroundColor: Colors.lightGrey, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 7, backgroundColor: Colors.primary, borderRadius: 4 },
});
