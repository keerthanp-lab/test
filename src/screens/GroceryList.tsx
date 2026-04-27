import React, { useContext, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import LogInContext from '../context/LoginContext';
import { Colors, BorderRadius, FontSize, Spacing } from '../constants/theme';
import type { GroceryItem } from '../types';

const GroceryList: React.FC = () => {
  const { firebase } = useContext(LogInContext);

  const [items, setItems] = useState<GroceryItem[]>([]);
  const [userEmail, setUserEmail] = useState('');
  const [newItem, setNewItem] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    firebase.getCurrentUser().then(user => {
      if (user) setUserEmail(user.email ?? '');
    });
  }, []);

  useEffect(() => {
    const unsub = firestore()
      .collection('groceryList')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as GroceryItem));
        setItems(data);
      });
    return unsub;
  }, []);

  const addItem = async () => {
    if (!newItem.trim()) {
      Alert.alert('Error', 'Enter an item name');
      return;
    }
    const now = firestore.FieldValue.serverTimestamp();
    await firestore().collection('groceryList').add({
      item: newItem.trim(),
      addedBy: userEmail,
      createdAt: now,
      updated_last: now,
    });
    setNewItem('');
  };

  const startEdit = (grocery: GroceryItem) => {
    setEditingId(grocery.id);
    setEditValue(grocery.item);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editValue.trim()) {
      Alert.alert('Error', 'Item name cannot be empty');
      return;
    }
    await firestore().collection('groceryList').doc(editingId).update({
      item: editValue.trim(),
      updated_last: firestore.FieldValue.serverTimestamp(),
    });
    setEditingId(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const deleteItem = (grocery: GroceryItem) => {
    Alert.alert('Delete', `Remove "${grocery.item}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => firestore().collection('groceryList').doc(grocery.id).delete(),
      },
    ]);
  };

  const renderItem = ({ item }: { item: GroceryItem }) => {
    const isEditing = editingId === item.id;
    return (
      <View style={styles.itemCard}>
        {isEditing ? (
          <View style={styles.editRow}>
            <TextInput
              style={styles.editInput}
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
            />
            <TouchableOpacity style={styles.saveBtn} onPress={saveEdit}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelInlineBtn} onPress={cancelEdit}>
              <Text style={styles.cancelInlineBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.itemRow}>
            <Text style={styles.itemText}>{item.item}</Text>
            <View style={styles.itemActions}>
              <TouchableOpacity style={styles.editBtn} onPress={() => startEdit(item)}>
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(item)}>
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Add a grocery item…"
          placeholderTextColor={Colors.grey}
          value={newItem}
          onChangeText={setNewItem}
          onSubmitEditing={addItem}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addBtn} onPress={addItem} activeOpacity={0.8}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Your grocery list is empty.</Text>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
};

export default GroceryList;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  addRow: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: Colors.white,
  },
  addBtn: {
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
  },
  addBtnText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: FontSize.md,
  },
  list: {
    padding: Spacing.lg,
  },
  itemCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    elevation: 1,
    shadowColor: Colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemText: {
    fontSize: FontSize.md,
    color: Colors.text,
    flex: 1,
  },
  itemActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  editBtn: {
    backgroundColor: Colors.secondary,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  editBtnText: {
    color: Colors.white,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  deleteBtn: {
    backgroundColor: Colors.danger,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  deleteBtnText: {
    color: Colors.white,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  saveBtn: {
    backgroundColor: Colors.success,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  cancelInlineBtn: {
    backgroundColor: Colors.grey,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  cancelInlineBtnText: {
    color: Colors.white,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: Spacing.xxl,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
});
