export interface Group {
  id: string;
  name: string;
  members: string[]; // array of email addresses
  createdBy: string; // userId
  createdAt: any;
  updated_last: any;
}

export type SplitType = 'equal' | 'byAmount' | 'settlement';

export interface ShareDetail {
  [email: string]: number;
}

export interface SharedExpense {
  id: string;
  itemName: string;
  cost: number;
  date: string; // ISO date string YYYY-MM-DD
  userId: string;
  email: string; // who paid / added
  groupId: string;
  splitType: SplitType;
  shares: ShareDetail; // computed share per member
  createdAt: any;
  updated_last: any;
}

export interface PersonalExpense {
  id: string;
  itemName: string;
  cost: number;
  date: string; // ISO date string YYYY-MM-DD
  userId: string;
  email: string;
  createdAt: any;
  updated_last: any;
}

export interface GroceryItem {
  id: string;
  item: string;
  addedBy: string;
  createdAt: any;
  updated_last: any;
}

export interface MemberBalance {
  email: string;
  totalPaid: number;
  totalOwed: number;
  balance: number; // positive = others owe them, negative = they owe others
}
