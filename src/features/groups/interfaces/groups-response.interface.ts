export interface WhatsAppGroupParticipant {
  JID: string;
  PhoneNumber: string;
  LID: string;
  IsAdmin: boolean;
  IsSuperAdmin: boolean;
  DisplayName: string;
  Error: number;
  AddRequest: unknown | null;
}

export interface WhatsAppGroup {
  JID: string;
  OwnerJID: string;
  OwnerPN: string;
  Name: string;
  NameSetAt: string;
  NameSetBy: string;
  NameSetByPN: string;
  Topic: string;
  TopicID: string;
  TopicSetAt: string;
  TopicSetBy: string;
  TopicSetByPN: string;
  TopicDeleted: boolean;
  IsLocked: boolean;
  IsAnnounce: boolean;
  AnnounceVersionID: string;
  IsEphemeral: boolean;
  DisappearingTimer: number;
  IsIncognito: boolean;
  IsParent: boolean;
  DefaultMembershipApprovalMode: string;
  LinkedParentJID: string;
  IsDefaultSubGroup: boolean;
  IsJoinApprovalRequired: boolean;
  AddressingMode: string;
  GroupCreated: string;
  CreatorCountryCode: string;
  ParticipantVersionID: string;
  Participants: WhatsAppGroupParticipant[];
  ParticipantCount: number;
  MemberAddMode: string;
  Suspended: boolean;
}

export interface GroupsApiResponse {
  code: string;
  message: string;
  results: {
    data: WhatsAppGroup[];
  };
}

export interface MyGroupsResponse {
  code: string;
  message: string;
  total: number;
  groups: WhatsAppGroup[];
}
