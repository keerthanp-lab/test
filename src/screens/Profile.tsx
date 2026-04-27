import React, { useContext, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';

const Profile: React.FC = () => {
  const { firebase } = useContext(LogInContext);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    firebase.getCurrentUser().then(user => {
      if (user) {
        setEmail(user.email ?? '');
        setDisplayName(user.displayName ?? '');
      }
    });
  }, []);

  const initials = (displayName || email)
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('');

  const save = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Display name cannot be empty');
      return;
    }
    setSaving(true);
    const ok = await firebase.updateUser({ displayName: displayName.trim() });
    if (ok) {
      // Persist to Firestore so group views can look up names by email
      await firestore()
        .collection('users')
        .doc(email)
        .set(
          {
            displayName: displayName.trim(),
            email,
            updatedAt: firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    }
    setSaving(false);
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

        {/* Avatar */}
        <View style={s.avatarSection}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials || '?'}</Text>
          </View>
          <Text style={s.emailLabel}>{email}</Text>
        </View>

        {/* Form card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Edit Profile</Text>

          <Text style={s.fieldLabel}>Display Name</Text>
          <TextInput
            style={s.input}
            placeholder="Enter your name"
            placeholderTextColor={Colors.grey}
            value={displayName}
            onChangeText={v => { setDisplayName(v); setSaved(false); }}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={save}
          />

          <Text style={s.fieldLabel}>Email</Text>
          <View style={s.readOnlyField}>
            <Text style={s.readOnlyText}>{email}</Text>
          </View>
          <Text style={s.hint}>Email cannot be changed here.</Text>

          <TouchableOpacity
            style={[s.saveBtn, (saving || saved) && s.saveBtnDone]}
            onPress={save}
            disabled={saving}
            activeOpacity={0.85}>
            {saving ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <Text style={s.saveBtnText}>
                {saved ? 'Saved ✓' : 'Save Changes'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default Profile;

const AVATAR_SIZE = 88;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: 48 },

  avatarSection: { alignItems: 'center', paddingVertical: Spacing.xl },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: Colors.white },
  emailLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },

  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    elevation: 1,
    shadowColor: Colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: Colors.white,
    marginBottom: Spacing.xs,
  },
  readOnlyField: {
    borderWidth: 1,
    borderColor: Colors.lightGrey,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.background,
    marginBottom: Spacing.xs,
  },
  readOnlyText: { fontSize: FontSize.md, color: Colors.grey },
  hint: { fontSize: FontSize.xs, color: Colors.grey, marginBottom: Spacing.lg },

  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  saveBtnDone: { backgroundColor: Colors.positiveGreen },
  saveBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
});
