import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';

// ─── constants ────────────────────────────────────────────────────────────────

const ITEM_H = 50;       // height of each row
const VISIBLE = 5;       // rows shown at once (odd → centre = selected)
const PICKER_H = ITEM_H * VISIBLE;
const PAD = ITEM_H * Math.floor(VISIBLE / 2); // top/bottom padding so first/last can centre

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const START_YEAR = 2024;

const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

// ─── WheelColumn ──────────────────────────────────────────────────────────────

interface WheelColProps {
  items: string[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  width?: number;
}

const WheelColumn: React.FC<WheelColProps> = ({ items, selectedIndex, onSelect, width }) => {
  const scrollRef = useRef<ScrollView>(null);
  const lastIdx = useRef(selectedIndex);
  const isUserScrolling = useRef(false);

  // Scroll to initial position after the modal has rendered
  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
    }, 80);
    return () => clearTimeout(t);
  }, []);

  // Scroll programmatically when selectedIndex is changed externally (e.g. day clamping)
  useEffect(() => {
    if (!isUserScrolling.current && selectedIndex !== lastIdx.current) {
      lastIdx.current = selectedIndex;
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: true });
    }
  }, [selectedIndex]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    isUserScrolling.current = false;
    const raw = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(Math.round(raw / ITEM_H), items.length - 1));
    lastIdx.current = idx;
    onSelect(idx);
  };

  return (
    <View style={[wc.wrap, width ? { width } : { flex: 1 }]}>
      {/* Fixed highlight strip in the centre */}
      <View style={wc.strip} pointerEvents="none" />

      {/* Fade overlays — top */}
      <View style={[wc.fade, wc.fadeTop]} pointerEvents="none" />
      {/* Fade overlays — bottom */}
      <View style={[wc.fade, wc.fadeBottom]} pointerEvents="none" />

      <ScrollView
        ref={scrollRef}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => { isUserScrolling.current = true; }}
        onMomentumScrollEnd={onMomentumEnd}
        contentContainerStyle={{ paddingVertical: PAD }}>
        {items.map((label, i) => {
          const dist = Math.abs(i - selectedIndex);
          return (
            <View key={i} style={wc.item}>
              <Text
                style={[
                  wc.text,
                  dist === 0 && wc.textSel,
                  dist === 1 && wc.textNear,
                  dist >= 2 && wc.textFar,
                ]}
                numberOfLines={1}>
                {label}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const wc = StyleSheet.create({
  wrap: { height: PICKER_H, overflow: 'hidden' },

  strip: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: PAD,
    height: ITEM_H,
    backgroundColor: 'rgba(0,0,0,0.07)',
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(0,0,0,0.18)',
    borderRadius: 8,
    zIndex: 1,
  },

  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: PAD,
    zIndex: 2,
    pointerEvents: 'none',
  },
  fadeTop: { top: 0, backgroundColor: 'rgba(255,255,255,0.72)' },
  fadeBottom: { bottom: 0, backgroundColor: 'rgba(255,255,255,0.72)' },

  item: { height: ITEM_H, justifyContent: 'center', alignItems: 'center' },
  text: { textAlign: 'center', color: Colors.textSecondary },

  textSel: { fontSize: 22, fontWeight: '700', color: Colors.primary },
  textNear: { fontSize: FontSize.lg, opacity: 0.55, fontWeight: '400' },
  textFar: { fontSize: FontSize.sm, opacity: 0.2 },
});

// ─── DatePickerField ──────────────────────────────────────────────────────────

interface DatePickerFieldProps {
  value: Date;
  onChange: (date: Date) => void;
  label?: string;
  maximumDate?: Date;
}

export const DatePickerField: React.FC<DatePickerFieldProps> = ({
  value,
  onChange,
  label,
  maximumDate = new Date(),
}) => {
  const [show, setShow] = useState(false);
  const [tempDay, setTempDay] = useState(value.getDate());
  const [tempMonth, setTempMonth] = useState(value.getMonth() + 1); // 1-based
  const [tempYear, setTempYear] = useState(value.getFullYear());

  const curYear = maximumDate.getFullYear();

  // Recompute day list when month/year changes
  const maxDay = daysInMonth(tempYear, tempMonth);
  const dayItems = Array.from({ length: maxDay }, (_, i) => String(i + 1).padStart(2, '0'));
  const monthItems = MONTH_LABELS;
  const yearItems = Array.from({ length: curYear - START_YEAR + 1 }, (_, i) => String(START_YEAR + i));

  // Clamp day when month/year changes (e.g. Jan 31 → Feb → clamp to 28)
  useEffect(() => {
    const max = daysInMonth(tempYear, tempMonth);
    if (tempDay > max) setTempDay(max);
  }, [tempMonth, tempYear]);

  const open = () => {
    setTempDay(value.getDate());
    setTempMonth(value.getMonth() + 1);
    setTempYear(value.getFullYear());
    setShow(true);
  };

  const confirm = () => {
    const max = daysInMonth(tempYear, tempMonth);
    const day = Math.min(tempDay, max);
    let d = new Date(tempYear, tempMonth - 1, day);
    if (d > maximumDate) d = new Date(maximumDate);
    onChange(d);
    setShow(false);
  };

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <View style={fs.wrapper}>
      {label ? <Text style={fs.label}>{label}</Text> : null}

      <TouchableOpacity style={fs.trigger} onPress={open} activeOpacity={0.75}>
        <Text style={fs.triggerText}>{formatDate(value)}</Text>
        <Text style={fs.icon}>&#128197;</Text>
      </TouchableOpacity>

      <Modal visible={show} transparent animationType="slide">
        <View style={fs.overlay}>
          <View style={fs.sheet}>
            <Text style={fs.title}>Select Date</Text>

            {/* Column headers */}
            <View style={fs.headers}>
              <Text style={[fs.hdr, { width: 68 }]}>Day</Text>
              <Text style={[fs.hdr, { flex: 1 }]}>Month</Text>
              <Text style={[fs.hdr, { width: 76 }]}>Year</Text>
            </View>

            {/* Drum-roll wheels */}
            <View style={fs.wheels}>
              <WheelColumn
                width={68}
                items={dayItems}
                selectedIndex={Math.min(tempDay - 1, dayItems.length - 1)}
                onSelect={i => setTempDay(i + 1)}
              />
              <View style={fs.divider} />
              <WheelColumn
                items={monthItems}
                selectedIndex={tempMonth - 1}
                onSelect={i => setTempMonth(i + 1)}
              />
              <View style={fs.divider} />
              <WheelColumn
                width={76}
                items={yearItems}
                selectedIndex={Math.max(0, tempYear - START_YEAR)}
                onSelect={i => setTempYear(START_YEAR + i)}
              />
            </View>

            {/* Buttons */}
            <View style={fs.actions}>
              <TouchableOpacity
                style={fs.cancelBtn}
                onPress={() => setShow(false)}
                activeOpacity={0.7}>
                <Text style={fs.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={fs.doneBtn}
                onPress={confirm}
                activeOpacity={0.8}>
                <Text style={fs.doneTxt}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const fs = StyleSheet.create({
  wrapper: { marginBottom: Spacing.md },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.white,
  },
  triggerText: { fontSize: FontSize.md, color: Colors.text },
  icon: { fontSize: 16 },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: 36,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },

  headers: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  hdr: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  wheels: { flexDirection: 'row', alignItems: 'center' },
  divider: {
    width: 1,
    height: PICKER_H * 0.55,
    backgroundColor: Colors.border,
    marginHorizontal: 2,
  },

  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  cancelTxt: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: '600' },
  doneBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  doneTxt: { fontSize: FontSize.md, color: Colors.white, fontWeight: '700' },
});
