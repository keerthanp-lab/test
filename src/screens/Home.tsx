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

// ─── helpers ──────────────────────────────────────────────────────────────────

const INR = '₹';
const formatCurrency = (amount: number) => `${INR}${Math.abs(amount).toFixed(2)}`;
const shortEmail = (email: string) => email.slice(0, 5);
const paidByLabel = (email: string) => (email ?? '').split('@')[0] || email;
const toDateStr = (d: Date) => d.toISOString().split('T')[0];

// Handles Firestore Timestamp, YYYY-MM-DD, DD-MM-YYYY, or any parseable string
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

const formatDisplayDate = (raw: any): string => {
  const d = parseAnyDate(raw);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─── Component ────────────────────────────────────────────────────────────────

const Home: React.FC = () => {
  const { firebase } = useContext(LogInContext);

  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState('');

  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const selectedGroup = groups.find(g => g.id === selectedGroupId) ?? null;

  const [groupExpenses, setGroupExpenses] = useState<SharedExpense[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  // ── Create Group modal ────────────────────────────────────────────────────
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [memberEmailInput, setMemberEmailInput] = useState('');
  const [pendingMembers, setPendingMembers] = useState<string[]>([]);

  // ── Add Member to existing group ─────────────────────────────────────────
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberEmail, setAddMemberEmail] = useState('');

  // ── Expense form modal ────────────────────────────────────────────────────
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<SharedExpense | null>(null);
  const [formItemName, setFormItemName] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formDate, setFormDate] = useState(new Date());
  const [formSplitType, setFormSplitType] = useState<SplitType>('equal');
  const [formEqualMembers, setFormEqualMembers] = useState<string[]>([]);
  const [formShareInputs, setFormShareInputs] = useState<Record<string, string>>({});

  // ── Settle Up modal ───────────────────────────────────────────────────────
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settlePayer, setSettlePayer] = useState('');
  const [settleRecipient, setSettleRecipient] = useState('');
  const [settleAmount, setSettleAmount] = useState('');

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    firebase.getCurrentUser().then(user => {
      if (user) { setUserId(user.uid); setUserEmail(user.email ?? ''); }
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
    if (!selectedGroupId) { setGroupExpenses([]); return; }
    const unsub = firestore()
      .collection('shared_expenses')
      .where('groupId', '==', selectedGroupId)
      .onSnapshot(snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as SharedExpense));
        data.sort((a, b) => (b.date > a.date ? 1 : -1));
        setGroupExpenses(data);
      });
    return unsub;
  }, [selectedGroupId]);

  // ─── Balances ─────────────────────────────────────────────────────────────

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

  // ─── Shares ───────────────────────────────────────────────────────────────

  const computeShares = (
    allMembers: string[],
    cost: number,
    splitType: SplitType,
    inputs: Record<string, string>,
    equalMembers: string[],
  ): Record<string, number> => {
    if (splitType === 'equal') {
      const included = equalMembers.length > 0 ? equalMembers : allMembers;
      const perPerson = cost / included.length;
      const shares: Record<string, number> = {};
      allMembers.forEach(m => { shares[m] = 0; });
      included.forEach((m, i) => {
        shares[m] =
          i === included.length - 1
            ? Math.round((cost - perPerson * (included.length - 1)) * 100) / 100
            : Math.round(perPerson * 100) / 100;
      });
      return shares;
    }
    const shares: Record<string, number> = {};
    allMembers.forEach(m => {
      shares[m] = Math.round((parseFloat(inputs[m] ?? '0') || 0) * 100) / 100;
    });
    return shares;
  };

  // ─── Group handlers ───────────────────────────────────────────────────────

  const createGroup = async () => {
    if (!newGroupName.trim()) { Alert.alert('Error', 'Group name is required'); return; }
    const members = [...new Set([userEmail, ...pendingMembers])].filter(Boolean);
    if (members.length < 2) { Alert.alert('Error', 'Add at least one other member'); return; }
    const now = firestore.FieldValue.serverTimestamp();
    await firestore().collection('groups').add({
      name: newGroupName.trim(), members, createdBy: userId, createdAt: now, updated_last: now,
    });
    setNewGroupName(''); setPendingMembers([]); setMemberEmailInput(''); setShowCreateGroup(false);
  };

  const addPendingMember = () => {
    const email = memberEmailInput.trim().toLowerCase();
    if (!email || !/\S+@\S+\.\S+/.test(email)) { Alert.alert('Error', 'Enter a valid email'); return; }
    if (email === userEmail.toLowerCase()) { Alert.alert('Error', 'You are already included'); return; }
    if (pendingMembers.includes(email)) { Alert.alert('Error', 'Already added'); return; }
    setPendingMembers(prev => [...prev, email]);
    setMemberEmailInput('');
  };

  const addMemberToGroup = async () => {
    const email = addMemberEmail.trim().toLowerCase();
    if (!email || !/\S+@\S+\.\S+/.test(email)) { Alert.alert('Error', 'Enter a valid email'); return; }
    if (selectedGroup?.members.includes(email)) { Alert.alert('Error', 'Already a member'); return; }
    await firestore().collection('groups').doc(selectedGroup!.id).update({
      members: firestore.FieldValue.arrayUnion(email),
      updated_last: firestore.FieldValue.serverTimestamp(),
    });
    setAddMemberEmail('');
    setShowAddMemberModal(false);
  };

  const deleteGroup = () => {
    if (!selectedGroup) return;
    if (selectedGroup.createdBy !== userId) {
      Alert.alert('Permission Denied', 'Only the group admin can delete this group.');
      return;
    }
    Alert.alert(
      'Delete Group',
      `Delete "${selectedGroup.name}"? This will permanently remove all expenses in this group.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Delete all shared expenses in the group
            const expSnap = await firestore()
              .collection('shared_expenses')
              .where('groupId', '==', selectedGroup.id)
              .get();
            const batch = firestore().batch();
            expSnap.docs.forEach(doc => batch.delete(doc.ref));
            batch.delete(firestore().collection('groups').doc(selectedGroup.id));
            await batch.commit();
            setSelectedGroupId(null);
          },
        },
      ],
    );
  };

  // ─── Expense handlers ─────────────────────────────────────────────────────

  const openAddExpenseForm = () => {
    setEditingExpense(null);
    setFormItemName(''); setFormCost(''); setFormDate(new Date());
    setFormSplitType('equal');
    setFormEqualMembers(selectedGroup?.members ?? []);
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
    // Reconstruct checked members from shares (non-zero entries)
    const checked = Object.entries(expense.shares)
      .filter(([, v]) => v > 0)
      .map(([k]) => k);
    setFormEqualMembers(checked.length ? checked : (selectedGroup?.members ?? []));
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
    if (formSplitType === 'equal' && formEqualMembers.length === 0) {
      Alert.alert('Error', 'Select at least one member for the split');
      return;
    }
    if (formSplitType === 'byAmount') {
      const total = selectedGroup.members.reduce(
        (s, m) => s + (parseFloat(formShareInputs[m] ?? '0') || 0), 0,
      );
      if (Math.abs(total - cost) > 0.01) {
        Alert.alert(
          'Split Mismatch',
          `Share amounts (${INR}${total.toFixed(2)}) must equal total cost (${INR}${cost.toFixed(2)})`,
        );
        return;
      }
    }
    const shares = computeShares(selectedGroup.members, cost, formSplitType, formShareInputs, formEqualMembers);
    const now = firestore.FieldValue.serverTimestamp();
    const data = {
      itemName: formItemName.trim(), cost, date: toDateStr(formDate),
      userId, email: userEmail, groupId: selectedGroup.id,
      splitType: formSplitType, shares, updated_last: now,
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
    Alert.alert('Delete', `Remove "${expense.itemName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => firestore().collection('shared_expenses').doc(expense.id).delete() },
    ]);
  };

  // ─── Settle Up ────────────────────────────────────────────────────────────

  const openSettleModal = () => {
    const balances = computeBalances();
    const debtor = balances.find(b => b.balance < -0.005);
    const creditor = balances.find(b => b.balance > 0.005);
    setSettlePayer(debtor?.email ?? selectedGroup?.members[0] ?? '');
    setSettleRecipient(creditor?.email ?? selectedGroup?.members[1] ?? '');
    setSettleAmount(debtor ? Math.abs(debtor.balance).toFixed(2) : '');
    setShowSettleModal(true);
  };

  // Opens settle modal pre-filled from a specific balance row
  const openSettleForRow = (b: MemberBalance) => {
    const balances = computeBalances();
    if (b.balance < -0.005) {
      // This person owes → they pay
      setSettlePayer(b.email);
      const creditor = balances.find(x => x.email !== b.email && x.balance > 0.005);
      setSettleRecipient(creditor?.email ?? '');
      setSettleAmount(Math.abs(b.balance).toFixed(2));
    } else if (b.balance > 0.005) {
      // This person is owed → someone pays them
      setSettleRecipient(b.email);
      const debtor = balances.find(x => x.email !== b.email && x.balance < -0.005);
      setSettlePayer(debtor?.email ?? '');
      setSettleAmount(Math.abs(b.balance).toFixed(2));
    }
    setShowSettleModal(true);
  };

  const settleUp = async () => {
    if (!settlePayer || !settleRecipient) { Alert.alert('Error', 'Select payer and recipient'); return; }
    if (settlePayer === settleRecipient) { Alert.alert('Error', 'Payer and recipient must be different'); return; }
    const amount = parseFloat(settleAmount);
    if (!amount || amount <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }
    const now = firestore.FieldValue.serverTimestamp();
    await firestore().collection('shared_expenses').add({
      itemName: 'Settlement',
      cost: amount,
      date: toDateStr(new Date()),
      userId,
      email: settlePayer,
      groupId: selectedGroup!.id,
      splitType: 'settlement' as SplitType,
      shares: { [settleRecipient]: amount },
      createdAt: now,
      updated_last: now,
    });
    await firestore().collection('groups').doc(selectedGroup!.id).update({ updated_last: now });
    setShowSettleModal(false);
    setSettleAmount('');
  };

  // ─── Modals ───────────────────────────────────────────────────────────────

  const renderCreateGroupModal = () => (
    <Modal visible={showCreateGroup} animationType="slide" transparent>
      <View style={s.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlayInner}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>Create Group</Text>

              <Text style={s.fieldLabel}>Group Name</Text>
              <TextInput
                style={s.textInput}
                placeholder="e.g. Our Apartment"
                placeholderTextColor={Colors.grey}
                value={newGroupName}
                onChangeText={setNewGroupName}
              />

              <Text style={s.fieldLabel}>Members</Text>
              <Text style={s.fieldHint}>You are included automatically.</Text>

              <View style={s.chipsWrap}>
                {pendingMembers.map(m => (
                  <View key={m} style={s.memberChip}>
                    <Text style={s.memberChipText} numberOfLines={1}>{shortEmail(m)}</Text>
                    <TouchableOpacity onPress={() => setPendingMembers(p => p.filter(x => x !== m))}>
                      <Text style={s.memberChipRemove}>&#10005;</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              <View style={s.memberAddRow}>
                <TextInput
                  style={[s.textInput, s.flex1, { marginBottom: 0 }]}
                  placeholder="email@example.com"
                  placeholderTextColor={Colors.grey}
                  value={memberEmailInput}
                  onChangeText={setMemberEmailInput}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TouchableOpacity style={s.addBtn} onPress={addPendingMember}>
                  <Text style={s.addBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>

              <View style={s.modalFooter}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowCreateGroup(false); setNewGroupName(''); setPendingMembers([]); setMemberEmailInput(''); }}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.primaryBtn} onPress={createGroup}>
                  <Text style={s.primaryBtnText}>Create Group</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  const renderAddMemberModal = () => (
    <Modal visible={showAddMemberModal} animationType="slide" transparent>
      <View style={s.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlayInner}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Add Member</Text>
            <Text style={s.fieldLabel}>Member Email</Text>
            <View style={s.memberAddRow}>
              <TextInput
                style={[s.textInput, s.flex1, { marginBottom: 0 }]}
                placeholder="email@example.com"
                placeholderTextColor={Colors.grey}
                value={addMemberEmail}
                onChangeText={setAddMemberEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus
              />
            </View>
            <View style={[s.modalFooter, { marginTop: Spacing.md }]}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowAddMemberModal(false); setAddMemberEmail(''); }}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.primaryBtn} onPress={addMemberToGroup}>
                <Text style={s.primaryBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  const renderSettleModal = () => {
    const members = selectedGroup?.members ?? [];
    return (
      <Modal visible={showSettleModal} animationType="slide" transparent>
        <View style={s.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlayInner}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              <View style={s.modalCard}>
                <Text style={s.modalTitle}>Settle Up</Text>

                {/* Who paid — dropdown chips */}
                <Text style={s.fieldLabel}>Who paid?</Text>
                <View style={s.chipSelector}>
                  {members.map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[s.selectorChip, settlePayer === m && s.selectorChipActive]}
                      onPress={() => setSettlePayer(m)}
                      activeOpacity={0.7}>
                      <Text style={[s.selectorChipText, settlePayer === m && s.selectorChipTextActive]}>
                        {shortEmail(m)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* To whom */}
                <Text style={s.fieldLabel}>To whom?</Text>
                <View style={s.chipSelector}>
                  {members.filter(m => m !== settlePayer).map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[s.selectorChip, settleRecipient === m && s.selectorChipActive]}
                      onPress={() => setSettleRecipient(m)}
                      activeOpacity={0.7}>
                      <Text style={[s.selectorChipText, settleRecipient === m && s.selectorChipTextActive]}>
                        {shortEmail(m)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Amount */}
                <Text style={s.fieldLabel}>Amount ({INR})</Text>
                <TextInput
                  style={s.textInput}
                  placeholder="0.00"
                  placeholderTextColor={Colors.grey}
                  value={settleAmount}
                  onChangeText={setSettleAmount}
                  keyboardType="decimal-pad"
                />

                <View style={s.modalFooter}>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => setShowSettleModal(false)}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.primaryBtn} onPress={settleUp}>
                    <Text style={s.primaryBtnText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    );
  };

  const renderExpenseFormModal = () => {
    const members = selectedGroup?.members ?? [];
    const costNum = parseFloat(formCost) || 0;
    const perPerson = formEqualMembers.length > 0 && costNum > 0
      ? costNum / formEqualMembers.length
      : 0;
    const byAmountTotal = members.reduce(
      (sum, m) => sum + (parseFloat(formShareInputs[m] ?? '0') || 0), 0,
    );
    const byAmountOk = costNum > 0 && Math.abs(byAmountTotal - costNum) <= 0.01;

    return (
      <Modal visible={showExpenseForm} animationType="slide" transparent>
        <View style={s.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlayInner}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              <View style={s.modalCard}>
                <Text style={s.modalTitle}>{editingExpense ? 'Edit Expense' : 'Add Expense'}</Text>

                <Text style={s.fieldLabel}>Item Name</Text>
                <TextInput
                  style={s.textInput}
                  placeholder="e.g. Electricity bill"
                  placeholderTextColor={Colors.grey}
                  value={formItemName}
                  onChangeText={setFormItemName}
                />

                <Text style={s.fieldLabel}>Amount ({INR})</Text>
                <TextInput
                  style={s.textInput}
                  placeholder="0.00"
                  placeholderTextColor={Colors.grey}
                  value={formCost}
                  onChangeText={setFormCost}
                  keyboardType="decimal-pad"
                />

                <DatePickerField label="Expense Date" value={formDate} onChange={setFormDate} />

                <Text style={s.fieldLabel}>Split Type</Text>
                <View style={s.splitToggle}>
                  {(['equal', 'byAmount'] as SplitType[]).map(type => (
                    <TouchableOpacity
                      key={type}
                      style={[s.splitBtn, formSplitType === type && s.splitBtnActive]}
                      onPress={() => setFormSplitType(type)}>
                      <Text style={[s.splitBtnText, formSplitType === type && s.splitBtnTextActive]}>
                        {type === 'equal' ? 'Equal' : 'By Amount'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Equal split — checkboxes */}
                {formSplitType === 'equal' && (
                  <View style={s.splitSection}>
                    <Text style={s.fieldLabel}>Split among:</Text>
                    {members.map(m => {
                      const checked = formEqualMembers.includes(m);
                      return (
                        <TouchableOpacity
                          key={m}
                          style={s.checkRow}
                          onPress={() =>
                            setFormEqualMembers(prev =>
                              checked ? prev.filter(x => x !== m) : [...prev, m],
                            )
                          }
                          activeOpacity={0.7}>
                          <View style={[s.checkbox, checked && s.checkboxOn]}>
                            {checked && <Text style={s.checkTick}>&#10003;</Text>}
                          </View>
                          <Text style={s.checkLabel} numberOfLines={1}>{shortEmail(m)}</Text>
                          {checked && perPerson > 0 && (
                            <Text style={s.checkShare}>{formatCurrency(perPerson)}</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                    {formEqualMembers.length === 0 && (
                      <Text style={s.warnText}>Select at least one member</Text>
                    )}
                  </View>
                )}

                {/* By amount — manual inputs */}
                {formSplitType === 'byAmount' && (
                  <View>
                    <Text style={s.fieldLabel}>Each Member's Share</Text>
                    {members.map(m => (
                      <View key={m} style={s.shareRow}>
                        <Text style={s.shareEmail} numberOfLines={1}>{shortEmail(m)}</Text>
                        <TextInput
                          style={s.shareInput}
                          placeholder="0.00"
                          placeholderTextColor={Colors.grey}
                          value={formShareInputs[m] ?? ''}
                          onChangeText={v => setFormShareInputs(prev => ({ ...prev, [m]: v }))}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    ))}
                    <Text style={[s.byAmountStatus, byAmountOk ? s.statusOk : s.statusErr]}>
                      {`Total: ${INR}${byAmountTotal.toFixed(2)} / ${INR}${costNum.toFixed(2)}`}
                      {byAmountOk ? '  ✓' : '  (must match)'}
                    </Text>
                  </View>
                )}

                <View style={s.modalFooter}>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => setShowExpenseForm(false)}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.primaryBtn} onPress={saveExpense}>
                    <Text style={s.primaryBtnText}>{editingExpense ? 'Update' : 'Add Expense'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    );
  };

  // ─── Group List ───────────────────────────────────────────────────────────

  const renderGroupList = () => (
    <View style={s.screen}>
      <View style={s.topBar}>
        <Text style={s.topBarTitle}>Shared Expenses</Text>
        <TouchableOpacity style={s.topBarAction} onPress={() => setShowCreateGroup(true)}>
          <Text style={s.topBarActionText}>+ Group</Text>
        </TouchableOpacity>
      </View>

      {loadingGroups ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : groups.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyTitle}>No groups yet</Text>
          <Text style={s.emptySub}>Tap "+ Group" to create a shared expense group.</Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={g => g.id}
          contentContainerStyle={{ padding: Spacing.lg }}
          renderItem={({ item: group }) => (
            <TouchableOpacity
              style={s.groupCard}
              onPress={() => setSelectedGroupId(group.id)}
              activeOpacity={0.75}>
              <View style={s.groupCardRow}>
                <Text style={s.groupName}>{group.name}</Text>
                <Text style={s.groupArrow}>&rsaquo;</Text>
              </View>
              <Text style={s.groupMeta}>{group.members.length} members</Text>
              <Text style={s.groupMemberList} numberOfLines={1}>
                {group.members.map(shortEmail).join(', ')}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );

  // ─── Group Detail ─────────────────────────────────────────────────────────

  const renderGroupDetail = () => {
    if (!selectedGroup) return null;
    const balances = computeBalances();
    const totalExpenses = groupExpenses.reduce((s, e) => s + e.cost, 0);

    return (
      <View style={s.screen}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => setSelectedGroupId(null)} style={s.backBtn}>
            <Text style={s.backBtnText}>&lsaquo; Back</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle} numberOfLines={1}>{selectedGroup.name}</Text>
          {selectedGroup.createdBy === userId && (
            <TouchableOpacity style={[s.topBarAction, { backgroundColor: Colors.danger }]} onPress={deleteGroup}>
              <Text style={s.topBarActionText}>Delete</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.topBarAction, { backgroundColor: Colors.secondary }]} onPress={() => setShowAddMemberModal(true)}>
            <Text style={s.topBarActionText}>+ Member</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.topBarAction} onPress={openAddExpenseForm}>
            <Text style={s.topBarActionText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.detailContent}>
          {/* Summary */}
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Total Expenses</Text>
            <Text style={s.summaryAmount}>{formatCurrency(totalExpenses)}</Text>
            <Text style={s.summaryMeta}>
              {`${selectedGroup.members.length} members · ${groupExpenses.length} expenses`}
            </Text>
          </View>

          {/* Balances */}
          <View style={s.sectionRow}>
            <Text style={s.sectionHeading}>Member Balances</Text>
            <TouchableOpacity style={s.settleBtn} onPress={openSettleModal}>
              <Text style={s.settleBtnText}>Settle Up</Text>
            </TouchableOpacity>
          </View>
          <View style={s.balanceCard}>
            {balances.length === 0 ? (
              <Text style={s.noDataText}>Add expenses to see balances.</Text>
            ) : (
              balances.map((b, idx) => (
                <View
                  key={b.email}
                  style={[s.balanceRow, idx === balances.length - 1 && s.balanceRowLast]}>
                  <View style={s.balanceAvatar}>
                    <Text style={s.balanceAvatarText}>{shortEmail(b.email).toUpperCase()}</Text>
                  </View>
                  <View style={s.balanceRight}>
                    <Text style={s.balanceName} numberOfLines={1}>{paidByLabel(b.email)}</Text>
                    <Text
                      style={[
                        s.balanceAmount,
                        b.balance > 0.005 ? s.balPos : b.balance < -0.005 ? s.balNeg : s.balOk,
                      ]}>
                      {b.balance > 0.005
                        ? `gets back ${formatCurrency(b.balance)}`
                        : b.balance < -0.005
                        ? `owes ${formatCurrency(b.balance)}`
                        : `Settled ✓`}
                    </Text>
                    <Text style={s.balanceSub}>
                      {`paid ${formatCurrency(b.totalPaid)} · share ${formatCurrency(b.totalOwed)}`}
                    </Text>
                  </View>
                  {Math.abs(b.balance) > 0.005 && (
                    <TouchableOpacity
                      style={s.rowSettleBtn}
                      onPress={() => openSettleForRow(b)}
                      activeOpacity={0.75}>
                      <Text style={s.rowSettleBtnText}>Settle</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>

          {/* Expenses */}
          <Text style={s.sectionHeading}>Expenses</Text>
          {groupExpenses.length === 0 ? (
            <Text style={s.noDataText}>No expenses yet. Tap "+ Add" to record one.</Text>
          ) : (
            groupExpenses.map(expense => (
              <View key={expense.id} style={s.expenseCard}>
                <View style={s.expenseTop}>
                  <Text style={s.expenseName}>{expense.itemName}</Text>
                  <Text style={s.expenseCost}>{formatCurrency(expense.cost)}</Text>
                </View>
                <Text style={s.expenseMeta}>
                  {`${formatDisplayDate(expense.date)} · paid by ${paidByLabel(expense.email)}`}
                </Text>
                <Text style={s.expenseSplitLabel}>
                  {expense.splitType === 'equal' ? 'Split equally'
                    : expense.splitType === 'settlement' ? 'Settlement'
                    : 'Split by amount'}
                </Text>
                <View style={s.sharesRow}>
                  {Object.entries(expense.shares)
                    .filter(([, amount]) => amount > 0)
                    .map(([email, amount]) => (
                      <View key={email} style={s.shareChip}>
                        <Text style={s.shareChipEmail}>{shortEmail(email)}</Text>
                        <Text style={s.shareChipAmount}>{formatCurrency(amount)}</Text>
                      </View>
                    ))}
                </View>
                {expense.splitType !== 'settlement' && (
                  <View style={s.expenseActions}>
                    <TouchableOpacity style={s.editBtn} onPress={() => openEditExpenseForm(expense)}>
                      <Text style={s.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.deleteBtn} onPress={() => deleteExpense(expense)}>
                      <Text style={s.deleteBtnText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  };

  // ─── Root render ──────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      {selectedGroup ? renderGroupDetail() : renderGroupList()}
      {renderCreateGroupModal()}
      {renderAddMemberModal()}
      {renderExpenseFormModal()}
      {renderSettleModal()}
    </View>
  );
};

export default Home;

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  screen: { flex: 1 },
  flex1: { flex: 1 },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.card,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: Spacing.xs,
  },
  topBarTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  topBarAction: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.pill,
  },
  topBarActionText: { color: Colors.white, fontWeight: '600', fontSize: FontSize.xs },
  backBtn: { paddingRight: Spacing.xs },
  backBtnText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '600' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '600', color: Colors.text, marginBottom: Spacing.sm },
  emptySub: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  groupCard: {
    backgroundColor: Colors.card, borderRadius: BorderRadius.md,
    padding: Spacing.lg, marginBottom: Spacing.md,
    elevation: 2, shadowColor: Colors.black, shadowOpacity: 0.07, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  groupCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  groupName: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, flex: 1 },
  groupArrow: { fontSize: 22, color: Colors.grey },
  groupMeta: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600', marginBottom: 2 },
  groupMemberList: { fontSize: FontSize.xs, color: Colors.textSecondary },

  detailContent: { padding: Spacing.lg },

  summaryCard: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    padding: Spacing.lg, alignItems: 'center', marginBottom: Spacing.lg,
  },
  summaryLabel: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  summaryAmount: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.white, marginVertical: Spacing.xs },
  summaryMeta: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)' },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm, marginTop: Spacing.sm },
  sectionHeading: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  settleBtn: {
    backgroundColor: Colors.positiveGreen,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.pill,
  },
  settleBtnText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: '700' },

  balanceCard: {
    backgroundColor: Colors.card, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, marginBottom: Spacing.lg,
    elevation: 1, shadowColor: Colors.black, shadowOpacity: 0.05, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  noDataText: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center', paddingVertical: Spacing.lg },
  balanceRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.lightGrey,
    gap: Spacing.sm,
  },
  balanceRowLast: { borderBottomWidth: 0 },
  balanceAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  balanceAvatarText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  balanceRight: { flex: 1 },
  balanceName: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: 2 },
  balanceAmount: { fontSize: FontSize.sm, fontWeight: '700' },
  balPos: { color: Colors.positiveGreen },
  balNeg: { color: Colors.negativeRed },
  balOk: { color: Colors.neutralGrey },
  balanceSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  rowSettleBtn: {
    backgroundColor: Colors.positiveGreen,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.pill,
    marginLeft: Spacing.xs,
  },
  rowSettleBtnText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: '700' },

  expenseCard: {
    backgroundColor: Colors.card, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.md,
    elevation: 1, shadowColor: Colors.black, shadowOpacity: 0.05, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  expenseTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xs },
  expenseName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, flex: 1, paddingRight: Spacing.sm },
  expenseCost: { fontSize: FontSize.md, fontWeight: '700', color: Colors.primary },
  expenseMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: 2 },
  expenseSplitLabel: { fontSize: FontSize.xs, color: Colors.secondary, fontWeight: '600', marginBottom: Spacing.sm },
  sharesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  shareChip: {
    backgroundColor: Colors.primaryMuted, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, alignItems: 'center',
  },
  shareChipEmail: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },
  shareChipAmount: { fontSize: FontSize.xs, color: Colors.text },
  expenseActions: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end' },
  editBtn: { backgroundColor: Colors.secondary, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.sm },
  editBtnText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: '600' },
  deleteBtn: { backgroundColor: Colors.danger, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.sm },
  deleteBtnText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: '600' },

  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  overlayInner: { width: '100%' },
  modalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.xl, paddingBottom: 36,
  },
  modalTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  fieldLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500', marginBottom: Spacing.xs, marginTop: Spacing.sm },
  fieldHint: { fontSize: FontSize.xs, color: Colors.grey, marginBottom: Spacing.sm },
  textInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    fontSize: FontSize.md, color: Colors.text,
    backgroundColor: Colors.white, marginBottom: Spacing.sm,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.xs },
  memberChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.primaryMuted,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
  },
  memberChipText: { color: Colors.primary, fontSize: FontSize.sm },
  memberChipRemove: { color: Colors.primary, marginLeft: Spacing.sm, fontWeight: '700' },
  memberAddRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  addBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderRadius: BorderRadius.sm },
  addBtnText: { color: Colors.white, fontWeight: '600', fontSize: FontSize.sm },

  // Split
  splitToggle: { flexDirection: 'row', borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.primary, overflow: 'hidden', marginBottom: Spacing.md, marginTop: Spacing.xs },
  splitBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', backgroundColor: Colors.white },
  splitBtnActive: { backgroundColor: Colors.primary },
  splitBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  splitBtnTextActive: { color: Colors.white },
  splitSection: { marginBottom: Spacing.md },

  // Checkboxes
  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, gap: Spacing.sm },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkTick: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  checkLabel: { flex: 1, fontSize: FontSize.sm, color: Colors.text, fontWeight: '500' },
  checkShare: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  warnText: { fontSize: FontSize.xs, color: Colors.danger, marginTop: Spacing.xs },

  // By amount
  shareRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, gap: Spacing.sm },
  shareEmail: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  shareInput: {
    width: 90, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm,
    fontSize: FontSize.sm, color: Colors.text, textAlign: 'right',
  },
  byAmountStatus: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.md, textAlign: 'center' },
  statusOk: { color: Colors.success },
  statusErr: { color: Colors.danger },

  // Settle Up chips
  chipSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  selectorChip: {
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  selectorChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  selectorChipText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  selectorChipTextActive: { color: Colors.white },

  modalFooter: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm, paddingVertical: Spacing.md, alignItems: 'center' },
  cancelBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSize.md },
  primaryBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: BorderRadius.sm, paddingVertical: Spacing.md, alignItems: 'center' },
  primaryBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
});
