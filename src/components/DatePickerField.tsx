import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const daysInMonth = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate();

interface DatePickerFieldProps {
  value: Date;
  onChange: (date: Date) => void;
  label?: string;
  maximumDate?: Date;
}

interface SpinnerProps {
  label: string;
  display: string;
  onPrev: () => void;
  onNext: () => void;
}

const Spinner: React.FC<SpinnerProps> = ({ label, display, onPrev, onNext }) => (
  <View style={styles.spinner}>
    <Text style={styles.spinnerLabel}>{label}</Text>
    <TouchableOpacity onPress={onNext} style={styles.spinnerArrow} activeOpacity={0.6}>
      <Text style={styles.spinnerArrowText}>&#9650;</Text>
    </TouchableOpacity>
    <Text style={styles.spinnerValue}>{display}</Text>
    <TouchableOpacity onPress={onPrev} style={styles.spinnerArrow} activeOpacity={0.6}>
      <Text style={styles.spinnerArrowText}>&#9660;</Text>
    </TouchableOpacity>
  </View>
);

export const DatePickerField: React.FC<DatePickerFieldProps> = ({
  value,
  onChange,
  label,
  maximumDate = new Date(),
}) => {
  const [show, setShow] = useState(false);
  const [temp, setTemp] = useState(new Date(value));

  const clampToMax = (d: Date): Date => (d > maximumDate ? new Date(maximumDate) : d);

  const adjust = (field: 'day' | 'month' | 'year', delta: number) => {
    setTemp(prev => {
      const d = new Date(prev);
      if (field === 'year') {
        d.setFullYear(d.getFullYear() + delta);
      } else if (field === 'month') {
        let m = d.getMonth() + delta;
        if (m < 0) m = 11;
        if (m > 11) m = 0;
        d.setMonth(m);
      } else {
        const maxDay = daysInMonth(d.getFullYear(), d.getMonth());
        let day = d.getDate() + delta;
        if (day < 1) day = maxDay;
        if (day > maxDay) day = 1;
        d.setDate(day);
      }
      // Clamp day after month/year change
      const maxDay = daysInMonth(d.getFullYear(), d.getMonth());
      if (d.getDate() > maxDay) d.setDate(maxDay);
      return clampToMax(d);
    });
  };

  const open = () => {
    setTemp(new Date(value));
    setShow(true);
  };

  const confirm = () => {
    onChange(temp);
    setShow(false);
  };

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <TouchableOpacity style={styles.trigger} onPress={open} activeOpacity={0.7}>
        <Text style={styles.triggerText}>{formatDate(value)}</Text>
        <Text style={styles.triggerIcon}>&#128197;</Text>
      </TouchableOpacity>

      <Modal visible={show} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Select Date</Text>

            <View style={styles.spinnersRow}>
              <Spinner
                label="Day"
                display={String(temp.getDate()).padStart(2, '0')}
                onPrev={() => adjust('day', -1)}
                onNext={() => adjust('day', 1)}
              />
              <View style={styles.spinnerDivider} />
              <Spinner
                label="Month"
                display={MONTH_LABELS[temp.getMonth()]}
                onPrev={() => adjust('month', -1)}
                onNext={() => adjust('month', 1)}
              />
              <View style={styles.spinnerDivider} />
              <Spinner
                label="Year"
                display={String(temp.getFullYear())}
                onPrev={() => adjust('year', -1)}
                onNext={() => adjust('year', 1)}
              />
            </View>

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShow(false)}
                activeOpacity={0.7}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={confirm}
                activeOpacity={0.8}>
                <Text style={styles.confirmText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
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
  triggerIcon: { fontSize: 16 },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.xl,
    paddingBottom: 36,
  },
  sheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },

  spinnersRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  spinnerDivider: {
    width: 1,
    height: 80,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.sm,
  },
  spinner: {
    flex: 1,
    alignItems: 'center',
  },
  spinnerLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  spinnerArrow: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  spinnerArrowText: {
    fontSize: 14,
    color: Colors.primary,
  },
  spinnerValue: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    minWidth: 52,
    textAlign: 'center',
  },

  sheetActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  cancelText: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: '600' },
  confirmBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  confirmText: { fontSize: FontSize.md, color: Colors.white, fontWeight: '700' },
});
