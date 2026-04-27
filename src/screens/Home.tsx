import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import type { Group, MemberBalance, SharedExpense, SplitType } from '../types';

const toDateStr = (d: Date) => d.toISOString().split('T')[0];

const formatDisplayDate = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatCurrency = (amount: number) => `₹${Math.abs(amount).toFixed(2)}`;

const Home: React.FC = () => {
  const { firebase } = useContext(LogInContext);

  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState('');

  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupExpenses, setGroupExpenses] = useState<SharedExpense[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  // Create Group modal
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [memberEmailInput, setMemberEmailInput] = useState('');
  const [pendingMembers, setPendingMembers] = useState<string[]>([]);

  // Expense Form modal
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<SharedExpense | null>(null);
  const [formItemName, setFormItemName] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formDate, setFormDate] = useState(new Date());
  const [formSplitType, setFormSplitType] = useState<SplitType>('equal');
  const [formShareInputs, setFormShareInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    firebase.getCurrentUser().then(user => {
      if (user) {
        setUserId(user.uid);
        setUserEmail(user.email ?? '');
      }
    });
  }, []);

  useEffect(() => {
    if (!userEmail) return;
    setLoadingGroups(true);
    const unsub = firestore()
      .collection('groups')
      .where('members', 'array-contains', userEmail)
      .onSnapshot(
        snap => {
          const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Group));
          data.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
          setGroups(data);
          setLoadingGroups(false);
        },
        () => setLoadingGroups(false),
      );
    return unsub;
  }, [userEmail]);

  useEffect(() => {
    if (!selectedGroup) {
      setGroupExpenses([]);
      return;
    }
    const unsub = firestore()
      .collection('shared_expenses')
      .where('groupId', '==', selectedGroup.id)
      .onSnapshot(snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as SharedExpense));
        data.sort((a, b) => (b.date > a.date ? 1 : -1));
        setGroupExpenses(data);
      });
    return unsub;
  }, [selectedGroup?.id]);

  const computeBalances = useCallback((): MemberBalance[] => {
    if (!selectedGroup) return [];
    return selectedGroup.members.map(email => {
      const totalPaid = groupExpenses
        .filter(e => e.email === email)
        .reduce((sum, e) => sum + e.cost, 0);
      const totalOwed = groupExpenses.reduce((sum, e) => sum + (e.shares[email] ?? 0), 0);
      return { email, totalPaid, totalOwed, balance: totalPaid - totalOwed };
    });
  }, [selectedGroup, groupExpenses]);

  const computeShares = (
    members: string[],
    cost: number,
    splitType: SplitType,
    inputs: Record<string, string>,
  ): Record<string, number> => {
    if (splitType === 'equal') {
      const perPerson = cost / members.length;
      const shares: Record<string, number> = {};
      members.forEach((m, i) => {
        shares[m] =
          i === members.length - 1
            ? Math.round((cost - perPerson * (members.length - 1)) * 100) / 100
            : Math.round(perPerson * 100) / 100;
      });
      return shares;
    }
    const shares: Record<string, number> = {};
    members.forEach(m => {
      shares[m] = Math.round((parseFloat(inputs[m] ?? '0') || 0) * 100) / 100;
    });
    return shares;
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('Error', 'Group name is required');
      return;
    }
    const members = [...new Set([userEmail, ...pendingMembers])].filter(Boolean);
    if (members.length < 2) {
      Alert.alert('Error', 'Add at least one other member');
      return;
    }
    const now = firestore.FieldValue.serverTimestamp();
    await firestore().collection('groups').add({
      name: newGroupName.trim(),
      members,
      createdBy: userId,
      createdAt: now,
      updated_last: now,
    });
    resetCreateGroupForm();
  };

  const resetCreateGroupForm = () => {
    setNewGroupName('');
    setPendingMembers([]);
    setMemberEmailInput('');
    setShowCreateGroup(false);
  };

  const addPendingMember = () => {
    const email = memberEmailInput.trim().toLowerCase();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      Alert.alert('Error', 'Enter a valid email address');
      return;
    }
    if (email === userEmail.toLowerCase()) {
      Alert.alert('Error', 'You are already included in the group');
      return;
    }
    if (pendingMembers.includes(email)) {
      Alert.alert('Error', 'This member is already added');
      return;
    }
    setPendingMembers(prev => [...prev, email]);
    setMemberEmailInput('');
  };

  const openAddExpenseForm = () => {
    setEditingExpense(null);
    setFormItemName('');
    setFormCost('');
    setFormDate(new Date());
    setFormSplitType('equal');
    const inputs: Record<string, string> = {};
    selectedGroup?.members.forEach(m => { inputs[m] = ''; });
    setFormShareInputs(inputs);
    setShowExpenseForm(true);
  };

  const openEditExpenseForm = (expense: SharedExpense) => {
    setEditingExpense(expense);
    setFormItemName(expense.itemName);
    setFormCost(String(expense.cost));
    setFormDate(new Date(expense.date + 'T00:00:00'));
    setFormSplitType(expense.splitType);
    const inputs: Record<string, string> = {};
    selectedGroup?.members.forEach(m => { inputs[m] = String(expense.shares[m] ?? ''); });
    setFormShareInputs(inputs);
    setShowExpenseForm(true);
  };

  const saveExpense = async () => {
    if (!selectedGroup) return;
    if (!formItemName.trim()) { Alert.alert('Error', 'Item name is required'); return; }
    const cost = parseFloat(formCost);
    if (!cost || cost <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }

    if (formSplitType === 'byAmount') {
      const total = selectedGroup.members.reduce(
        (s, m) => s + (parseFloat(formShareInputs[m] ?? '0') || 0),
        0,
      );
      if (Math.abs(total - cost) > 0.01) {
        Alert.alert(
          'Split Mismatch',
          `Share amounts (₹${total.toFixed(2)}) must equal total cost (₹${cost.toFixed(2)})`,
        );
        return;
      }
    }

    const shares = computeShares(selectedGroup.members, cost, formSplitType, formShareInputs);
    const now = firestore.FieldValue.serverTimestamp();
    const data = {
      itemName: formItemName.trim(),
      cost,
      date: toDateStr(formDate),
      userId,
      email: userEmail,
      groupId: selectedGroup.id,
      splitType: formSplitType,
      shares,
      updated_last: now,
    };

    if (editingExpense) {
      await firestore().collection('shared_expenses').doc(editingExpense.id).update(data);
    } else {
      await firestore().collection('shared_expenses').add({ ...data, createdAt: now });
    }
    await firestore().collection('groups').doc(selectedGroup.id).update({ updated_last: now });
    setShowExpenseForm(false);
  };

  const deleteExpense = (expense: SharedExpense) => {
    Alert.alert('Delete Expense', `Remove "${expense.itemName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => firestore().collection('shared_expenses').doc(expense.id).delete(),
      },
    ]);
  };

  // ─── Create Group Modal ───────────────────────────────────────────────────────

  const renderCreateGroupModal = () => (
    <Modal visible={showCreateGroup} animationType="slide" transparent>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlayInner}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Create Group</Text>

              <Text style={styles.fieldLabel}>Group Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Our Apartment"
                placeholderTextColor={Colors.grey}
                value={newGroupName}
                onChangeText={setNewGroupName}
              />

              <Text style={styles.fieldLabel}>Members</Text>
              <Text style={styles.fieldHint}>You are included automatically.</Text>

              {pendingMembers.map(m => (
                <View key={m} style={styles.memberChip}>
                  <Text style={styles.memberChipText} numberOfLines={1}>{m}</Text>
                  <TouchableOpacity
                    onPress={() => setPendingMembers(prev => prev.filter(x => x !== m))}>
                    <Text style={styles.memberChipRemove}>&#10005;</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.memberAddRow}>
                <TextInput
                  style={[styles.textInput, styles.memberEmailInput]}
                  placeholder="email@example.com"
                  placeholderTextColor={Colors.grey}
                  value={memberEmailInput}
                  onChangeText={setMemberEmailInput}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.addMemberBtn} onPress={addPendingMember}>
                  <Text style={styles.addMemberBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.cancelBtn} onPress={resetCreateGroupForm}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={createGroup}>
                  <Text style={styles.primaryBtnText}>Create Group</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  // ─── Expense Form Modal ───────────────────────────────────────────────────────

  const renderExpenseFormModal = () => {
    const members = selectedGroup?.members ?? [];
    const costNum = parseFloat(formCost) || 0;
    const equalShare =
      members.length > 0 ? Math.round((costNum / members.length) * 100) / 100 : 0;
    const byAmountTotal = members.reduce(
      (s, m) => s + (parseFloat(formShareInputs[m] ?? '0') || 0),
      0,
    );
    const byAmountOk = costNum > 0 && Math.abs(byAmountTotal - costNum) <= 0.01;

    return (
      <Modal visible={showExpenseForm} animationType="slide" transparent>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.overlayInner}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>
                  {editingExpense ? 'Edit Expense' : 'Add Expense'}
                </Text>

                <Text style={styles.fieldLabel}>Item Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Electricity bill"
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

                <Text style={styles.fieldLabel}>Split Type</Text>
                <View style={styles.splitToggle}>
                  {(['equal', 'byAmount'] as SplitType[]).map(type => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.splitToggleBtn,
                        formSplitType === type && styles.splitToggleBtnActive,
                      ]}
                      onPress={() => setFormSplitType(type)}>
                      <Text
                        style={[
                          styles.splitToggleBtnText,
                          formSplitType === type && styles.splitToggleBtnTextActive,
                        ]}>
                        {type === 'equal' ? 'Equal' : 'By Amount'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {formSplitType === 'equal' ? (
                  <View style={styles.equalSplitBox}>
                    <Text style={styles.equalSplitText}>
                      {members.length} members &middot; ₹{equalShare.toFixed(2)} each
                    </Text>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.fieldLabel}>Each Member's Share</Text>
                    {members.map(m => (
                      <View key={m} style={styles.memberShareRow}>
                        <Text style={styles.memberShareEmail} numberOfLines={1}>{m}</Text>
                        <TextInput
                          style={styles.memberShareInput}
                          placeholder="0.00"
                          placeholderTextColor={Colors.grey}
                          value={formShareInputs[m] ?? ''}
                          onChangeText={v =>
                            setFormShareInputs(prev => ({ ...prev, [m]: v }))
                          }
                          keyboardType="decimal-pad"
                        />
                      </View>
                    ))}
                    <Text
                      style={[
                        styles.byAmountStatus,
                        byAmountOk ? styles.byAmountOk : styles.byAmountError,
                      ]}>
                      Total: ₹{byAmountTotal.toFixed(2)} / ₹{costNum.toFixed(2)}
                      {byAmountOk ? '  \u2713' : '  (must match)'}
                    </Text>
                  </View>
                )}

                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setShowExpenseForm(false)}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryBtn} onPress={saveExpense}>
                    <Text style={styles.primaryBtnText}>
                      {editingExpense ? 'Update' : 'Add Expense'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    );
  };

  // ─── Group List View ──────────────────────────────────────────────────────────

  const renderGroupList = () => (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Shared Expenses</Text>
        <TouchableOpacity
          style={styles.topBarAction}
          onPress={() => setShowCreateGroup(true)}>
          <Text style={styles.topBarActionText}>+ Group</Text>
        </TouchableOpacity>
      </View>

      {loadingGroups ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : groups.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No groups yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap "+ Group" to create a shared expense group with friends or roommates.
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={g => g.id}
          contentContainerStyle={{ padding: Spacing.lg }}
          renderItem={({ item: group }) => (
            <TouchableOpacity
              style={styles.groupCard}
              onPress={() => setSelectedGroup(group)}
              activeOpacity={0.75}>
              <View style={styles.groupCardRow}>
                <Text style={styles.groupName}>{group.name}</Text>
                <Text style={styles.groupArrow}>&rsaquo;</Text>
              </View>
              <Text style={styles.groupMeta}>{group.members.length} members</Text>
              <Text style={styles.groupMemberList} numberOfLines={1}>
                {group.members.join(', ')}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );

  // ─── Group Detail View ────────────────────────────────────────────────────────

  const renderGroupDetail = () => {
    if (!selectedGroup) return null;
    const balances = computeBalances();
    const totalExpenses = groupExpenses.reduce((s, e) => s + e.cost, 0);

    return (
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => setSelectedGroup(null)} style={styles.backBtn}>
            <Text style={styles.backBtnText}>&lsaquo; Back</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {selectedGroup.name}
          </Text>
          <TouchableOpacity style={styles.topBarAction} onPress={openAddExpenseForm}>
            <Text style={styles.topBarActionText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.detailContent}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Expenses</Text>
            <Text style={styles.summaryAmount}>{formatCurrency(totalExpenses)}</Text>
            <Text style={styles.summaryMeta}>
              {selectedGroup.members.length} members &middot; {groupExpenses.length} expenses
            </Text>
          </View>

          <Text style={styles.sectionHeading}>Member Balances</Text>
          <View style={styles.balanceCard}>
            {balances.length === 0 ? (
              <Text style={styles.noDataText}>Add expenses to see balances.</Text>
            ) : (
              balances.map((b, idx) => (
                <View
                  key={b.email}
                  style={[
                    styles.balanceRow,
                    idx === balances.length - 1 && styles.balanceRowLast,
                  ]}>
                  <Text style={styles.balanceEmail} numberOfLines={1}>
                    {b.email}
                  </Text>
                  <View style={styles.balanceRight}>
                    <Text
                      style={[
                        styles.balanceAmount,
                        b.balance > 0.005
                          ? styles.balancePositive
                          : b.balance < -0.005
                          ? styles.balanceNegative
                          : styles.balanceSettled,
                      ]}>
                      {b.balance > 0.005
                        ? `gets back ${formatCurrency(b.balance)}`
                        : b.balance < -0.005
                        ? `owes ${formatCurrency(b.balance)}`
                        : 'Settled \u2713'}
                    </Text>
                    <Text style={styles.balanceSub}>
                      paid {formatCurrency(b.totalPaid)} &middot; share{' '}
                      {formatCurrency(b.totalOwed)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <Text style={styles.sectionHeading}>Expenses</Text>
          {groupExpenses.length === 0 ? (
            <Text style={styles.noDataText}>
              No expenses yet. Tap "+ Add" to record one.
            </Text>
          ) : (
            groupExpenses.map(expense => (
              <View key={expense.id} style={styles.expenseCard}>
                <View style={styles.expenseCardTop}>
                  <Text style={styles.expenseItemName}>{expense.itemName}</Text>
                  <Text style={styles.expenseTotalCost}>{formatCurrency(expense.cost)}</Text>
                </View>
                <Text style={styles.expenseMeta}>
                  {formatDisplayDate(expense.date)} &middot; paid by {expense.email}
                </Text>
                <Text style={styles.expenseSplitLabel}>
                  {expense.splitType === 'equal' ? 'Split equally' : 'Split by amount'}
                </Text>
                <View style={styles.sharesRow}>
                  {Object.entries(expense.shares).map(([email, amount]) => (
                    <View key={email} style={styles.shareChip}>
                      <Text style={styles.shareChipEmail} numberOfLines={1}>
                        {email.split('@')[0]}
                      </Text>
                      <Text style={styles.shareChipAmount}>{formatCurrency(amount)}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.expenseActions}>
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => openEditExpenseForm(expense)}>
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => deleteExpense(expense)}>
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {selectedGroup ? renderGroupDetail() : renderGroupList()}
      {renderCreateGroupModal()}
      {renderExpenseFormModal()}
    </View>
  );
};

export default Home;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  screen: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  topBarTitle: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  topBarAction: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.pill,
  },
  topBarActionText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: FontSize.sm,
  },
  backBtn: { paddingRight: Spacing.sm },
  backBtnText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '600' },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  groupCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    elevation: 2,
    shadowColor: Colors.black,
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  groupCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  groupName: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  groupArrow: { fontSize: 22, color: Colors.grey },
  groupMeta: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
    marginBottom: 2,
  },
  groupMemberList: { fontSize: FontSize.xs, color: Colors.textSecondary },

  detailContent: { padding: Spacing.lg },

  summaryCard: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  summaryLabel: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  summaryAmount: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.white,
    marginVertical: Spacing.xs,
  },
  summaryMeta: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)' },

  sectionHeading: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },

  balanceCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    elevation: 1,
    shadowColor: Colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  noDataText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGrey,
  },
  balanceRowLast: { borderBottomWidth: 0 },
  balanceEmail: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
    paddingRight: Spacing.sm,
  },
  balanceRight: { alignItems: 'flex-end' },
  balanceAmount: { fontSize: FontSize.sm, fontWeight: '700' },
  balancePositive: { color: Colors.positiveGreen },
  balanceNegative: { color: Colors.negativeRed },
  balanceSettled: { color: Colors.neutralGrey },
  balanceSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },

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
  expenseTotalCost: { fontSize: FontSize.md, fontWeight: '700', color: Colors.primary },
  expenseMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: 2 },
  expenseSplitLabel: {
    fontSize: FontSize.xs,
    color: Colors.secondary,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  sharesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  shareChip: {
    backgroundColor: Colors.primaryMuted,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
  },
  shareChipEmail: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },
  shareChipAmount: { fontSize: FontSize.xs, color: Colors.text },
  expenseActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'flex-end',
  },
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

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
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
  fieldHint: { fontSize: FontSize.xs, color: Colors.grey, marginBottom: Spacing.sm },
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

  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryMuted,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.xs,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  memberChipText: { color: Colors.primary, fontSize: FontSize.sm, flex: 1 },
  memberChipRemove: { color: Colors.primary, marginLeft: Spacing.sm, fontWeight: '700' },
  memberAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  memberEmailInput: { flex: 1, marginBottom: 0 },
  addMemberBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  addMemberBtnText: { color: Colors.white, fontWeight: '600', fontSize: FontSize.sm },

  splitToggle: {
    flexDirection: 'row',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
  },
  splitToggleBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  splitToggleBtnActive: { backgroundColor: Colors.primary },
  splitToggleBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  splitToggleBtnTextActive: { color: Colors.white },
  equalSplitBox: {
    backgroundColor: Colors.primaryMuted,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  equalSplitText: { color: Colors.primary, fontWeight: '600', fontSize: FontSize.sm },

  memberShareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  memberShareEmail: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  memberShareInput: {
    width: 90,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
  },
  byAmountStatus: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  byAmountOk: { color: Colors.success },
  byAmountError: { color: Colors.danger },

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
