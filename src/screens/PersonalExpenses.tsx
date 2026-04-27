import React, { useContext, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import LogInContext from '../context/LoginContext';
import { DatePickerField } from '../components/DatePickerField';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';
import type { PersonalExpense } from '../types';

const toDateStr = (d: Date) => d.toISOString().split('T')[0];

// Handles Firestore Timestamp, YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, or any JS-parseable string
const parseAnyDate = (raw: any): Date | null => {
  if (!raw) return null;
  if (typeof raw === 'object' && typeof raw.toDate === 'function') return raw.toDate();
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s + 'T00:00:00');
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) return new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T00:00:00`);
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
};

const formatDisplayDate = (raw: any): string => {
  const d = parseAnyDate(raw);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const START_YEAR = 2024;
const START_MONTH = 8; // August

const PersonalExpenses: React.FC = () => {
  const { firebase } = useContext(LogInContext);

  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [expenses, setExpenses] = useState<PersonalExpense[]>([]);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formItemName, setFormItemName] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formDate, setFormDate] = useState(new Date());

  useEffect(() => {
    firebase.getCurrentUser().then(user => {
      if (user) {
        setUserId(user.uid);
        setUserEmail(user.email ?? '');
      }
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    const unsub = firestore()
      .collection('personal')
      .where('userId', '==', userId)
      .onSnapshot(snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as PersonalExpense));
        data.sort((a, b) => {
          const da = parseAnyDate(a.date)?.getTime() ?? 0;
          const db = parseAnyDate(b.date)?.getTime() ?? 0;
          return db - da;
        });
        setExpenses(data);
      });
    return unsub;
  }, [userId]);

  // Month navigation
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const isAtStart = selectedYear === START_YEAR && selectedMonth === START_MONTH;
  const isAtEnd = selectedYear === currentYear && selectedMonth === currentMonth;

  const prevMonth = () => {
    if (isAtStart) return;
    if (selectedMonth === 1) {
      setSelectedYear(y => y - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (isAtEnd) return;
    if (selectedMonth === 12) {
      setSelectedYear(y => y + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  const filteredExpenses = expenses.filter(e => {
    const d = parseAnyDate(e.date);
    if (!d) return true; // show records with unparseable dates rather than hiding them
    return d.getFullYear() === selectedYear && d.getMonth() + 1 === selectedMonth;
  });

  const monthTotal = filteredExpenses.reduce((sum, e) => sum + e.cost, 0);

  const openAddForm = () => {
    setEditingId(null);
    setFormItemName('');
    setFormCost('');
    setFormDate(new Date());
    setShowForm(true);
  };

  const openEditForm = (expense: PersonalExpense) => {
    setEditingId(expense.id);
    setFormItemName(expense.itemName);
    setFormCost(String(expense.cost));
    setFormDate(parseAnyDate(expense.date) ?? new Date());
    setShowForm(true);
  };

  const saveExpense = async () => {
    if (!formItemName.trim()) { Alert.alert('Error', 'Item name is required'); return; }
    const cost = parseFloat(formCost);
    if (!cost || cost <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }

    const ts = firestore.FieldValue.serverTimestamp();
    const data = {
      itemName: formItemName.trim(),
      cost,
      date: firestore.Timestamp.fromDate(formDate),
      userId,
      email: userEmail,
      updated_last: ts,
    };

    if (editingId) {
      await firestore().collection('personal').doc(editingId).update(data);
    } else {
      await firestore().collection('personal').add({ ...data, createdAt: ts });
    }
    setShowForm(false);
  };

  const deleteExpense = (expense: PersonalExpense) => {
    Alert.alert('Delete Expense', `Remove "${expense.itemName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => firestore().collection('personal').doc(expense.id).delete(),
      },
    ]);
  };

  const renderExpenseItem = ({ item }: { item: PersonalExpense }) => (
    <View style={styles.expenseCard}>
      <View style={styles.expenseCardTop}>
        <Text style={styles.expenseItemName}>{item.itemName}</Text>
        <Text style={styles.expenseCost}>₹{item.cost.toFixed(2)}</Text>
      </View>
      <Text style={styles.expenseDate}>{formatDisplayDate(item.date)}</Text>
      <View style={styles.expenseActions}>
        <TouchableOpacity style={styles.editBtn} onPress={() => openEditForm(item)}>
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteExpense(item)}>
          <Text style={styles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderForm = () => (
    <Modal visible={showForm} animationType="slide" transparent>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlayInner}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit Expense' : 'Add Expense'}
              </Text>

              <Text style={styles.fieldLabel}>Item Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Lunch, Transport"
                placeholderTextColor={Colors.grey}
                value={formItemName}
                onChangeText={setFormItemName}
              />

              <Text style={styles.fieldLabel}>Amount (₹)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="0.00"
                placeholderTextColor={Colors.grey}
                value={formCost}
                onChangeText={setFormCost}
                keyboardType="decimal-pad"
              />

              <DatePickerField label="Expense Date" value={formDate} onChange={setFormDate} />

              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={saveExpense}>
                  <Text style={styles.primaryBtnText}>
                    {editingId ? 'Update' : 'Add Expense'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {/* Month Navigator */}
      <View style={styles.monthNav}>
        <TouchableOpacity
          style={[styles.navBtn, isAtStart && styles.navBtnDisabled]}
          onPress={prevMonth}
          disabled={isAtStart}
          activeOpacity={0.7}>
          <Text style={[styles.navArrow, isAtStart && styles.navArrowDisabled]}>&#8249;</Text>
        </TouchableOpacity>

        <View style={styles.monthYearBlock}>
          <Text style={styles.monthYearLabel}>
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </Text>
          <Text style={styles.monthTotal}>₹{monthTotal.toFixed(2)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.navBtn, isAtEnd && styles.navBtnDisabled]}
          onPress={nextMonth}
          disabled={isAtEnd}
          activeOpacity={0.7}>
          <Text style={[styles.navArrow, isAtEnd && styles.navArrowDisabled]}>&#8250;</Text>
        </TouchableOpacity>
      </View>

      {/* Expense List */}
      <FlatList
        data={filteredExpenses}
        keyExtractor={e => e.id}
        renderItem={renderExpenseItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No expenses for this month.</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={openAddForm} activeOpacity={0.85}>
        <Text style={styles.fabText}>+ Add Expense</Text>
      </TouchableOpacity>

      {renderForm()}
    </View>
  );
};

export default PersonalExpenses;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  navBtn: {
    padding: Spacing.md,
    borderRadius: BorderRadius.pill,
  },
  navBtnDisabled: { opacity: 0.3 },
  navArrow: {
    fontSize: 28,
    color: Colors.white,
    fontWeight: '300',
    lineHeight: 32,
  },
  navArrowDisabled: { color: 'rgba(255,255,255,0.4)' },
  monthYearBlock: {
    flex: 1,
    alignItems: 'center',
  },
  monthYearLabel: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.white,
  },
  monthTotal: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    marginTop: 2,
  },

  list: { padding: Spacing.lg, paddingBottom: 100 },

  expenseCard: {
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
  expenseCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
  },
  expenseItemName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
    paddingRight: Spacing.sm,
  },
  expenseCost: { fontSize: FontSize.md, fontWeight: '700', color: Colors.primary },
  expenseDate: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: Spacing.sm },
  expenseActions: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end' },
  editBtn: {
    backgroundColor: Colors.secondary,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  editBtnText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: '600' },
  deleteBtn: {
    backgroundColor: Colors.danger,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  deleteBtnText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingTop: Spacing.xxl },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary },

  fab: {
    position: 'absolute',
    bottom: Spacing.xl,
    left: Spacing.xl,
    right: Spacing.xl,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.pill,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  overlayInner: { width: '100%' },
  modalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.xl,
    paddingBottom: 36,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  fieldLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: Colors.white,
    marginBottom: Spacing.sm,
  },
  modalFooter: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  cancelBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSize.md },
  primaryBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  primaryBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
});
