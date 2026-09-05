import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Archive,
  BellOff,
  Camera,
  Check,
  CheckCheck,
  ChevronLeft,
  CircleAlert,
  File,
  FileText,
  Image,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Mic,
  MoreVertical,
  Paperclip,
  Pause,
  Play,
  Plus,
  Reply,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";

/*
 * Chat.jsx – jedna kompletní komponenta
 *
 * Očekávané tabulky:
 * - chat_conversations
 * - chat_conversation_members
 * - chat_messages
 * - chat_message_reactions
 * - chat_message_reads
 *
 * Očekávaný Storage bucket:
 * - chat-files
 *
 * Důležité:
 * Zprávy se před uložením šifrují v prohlížeči pomocí AES-GCM.
 * Klíč se odvozuje z hesla konverzace a NEODESÍLÁ se do Supabase.
 * Supabase ukládá pouze šifrovaný obsah.
 */

const CONVERSATIONS_TABLE = "chat_conversations";
const MEMBERS_TABLE = "chat_conversation_members";
const MESSAGES_TABLE = "chat_messages";
const REACTIONS_TABLE = "chat_message_reactions";
const READS_TABLE = "chat_message_reads";
const DELIVERIES_TABLE = "chat_message_deliveries";
const PROFILES_TABLE = "profiles";
const CHAT_BUCKET = "chat-files";

const KEY_STORAGE_PREFIX = "chat_conversation_passphrase_";
const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡", "🎉", "🔥"];
const MESSAGE_PAGE_SIZE = 80;
const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;

const EMPTY_NEW_CONVERSATION = {
  type: "private",
  title: "",
  participantIds: [],
};

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `chat-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function formatTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatConversationTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (sameDay) return formatTime(value);

  return new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function getInitials(name, username) {
  const source = String(name || username || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);

  if (!parts.length) return "?";
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${
    parts[parts.length - 1][0] || ""
  }`.toUpperCase();
}

function getConversationTitle(conversation, currentUserId) {
  if (!conversation) return "Konverzace";

  if (conversation.type !== "private") {
    return conversation.title || "Skupinová konverzace";
  }

  const otherMember = (conversation.members || []).find(
    (member) => member.user_id !== currentUserId
  );

  return (
    otherMember?.profile?.full_name ||
    otherMember?.profile?.username ||
    "Soukromá konverzace"
  );
}

function getConversationSubtitle(conversation, currentUserId) {
  if (!conversation) return "";

  if (conversation.type === "house") {
    return "Společný chat domu";
  }

  if (conversation.type === "group") {
    return `${conversation.members?.length || 0} členů`;
  }

  const otherMember = (conversation.members || []).find(
    (member) => member.user_id !== currentUserId
  );

  return otherMember?.profile?.active === false
    ? "Neaktivní účet"
    : "Soukromý chat";
}

function getConversationAvatar(conversation, currentUserId) {
  if (!conversation) return null;

  if (conversation.type === "private") {
    const otherMember = (conversation.members || []).find(
      (member) => member.user_id !== currentUserId
    );

    return {
      url: otherMember?.profile?.avatar_url || "",
      initials: getInitials(
        otherMember?.profile?.full_name,
        otherMember?.profile?.username
      ),
    };
  }

  return {
    url: conversation.avatar_url || "",
    initials:
      conversation.type === "house"
        ? "DŮ"
        : getInitials(conversation.title, "SK"),
  };
}

function bytesToBase64(bytes) {
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function deriveConversationKey(passphrase, saltBase64) {
  const encoder = new TextEncoder();
  const salt = base64ToBytes(saltBase64);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 250000,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptText(plainText, key) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encoder.encode(plainText)
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

async function decryptText(ciphertext, ivBase64, key) {
  const decoder = new TextDecoder();

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(ivBase64),
    },
    key,
    base64ToBytes(ciphertext)
  );

  return decoder.decode(decrypted);
}

async function encryptFile(file, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buffer = await file.arrayBuffer();

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    buffer
  );

  return {
    blob: new Blob([encrypted], {
      type: "application/octet-stream",
    }),
    iv: bytesToBase64(iv),
  };
}

async function decryptFile(encryptedBlob, ivBase64, key, mimeType) {
  const encryptedBuffer = await encryptedBlob.arrayBuffer();

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(ivBase64),
    },
    key,
    encryptedBuffer
  );

  return new Blob([decrypted], {
    type: mimeType || "application/octet-stream",
  });
}

function getStoredPassphrase(conversationId) {
  if (typeof window === "undefined" || !conversationId) return "";

  return (
    window.sessionStorage.getItem(
      `${KEY_STORAGE_PREFIX}${conversationId}`
    ) || ""
  );
}

function storePassphrase(conversationId, passphrase) {
  if (typeof window === "undefined" || !conversationId) return;

  if (passphrase) {
    window.sessionStorage.setItem(
      `${KEY_STORAGE_PREFIX}${conversationId}`,
      passphrase
    );
  } else {
    window.sessionStorage.removeItem(
      `${KEY_STORAGE_PREFIX}${conversationId}`
    );
  }
}

function cleanAttachmentName(name) {
  return String(name || "soubor")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function detectMessageType(file) {
  const mime = String(file?.type || "");

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

function AudioMessage({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  }

  return (
    <div className="chat-audio">
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={(event) =>
          setDuration(event.currentTarget.duration || 0)
        }
        onTimeUpdate={(event) =>
          setCurrentTime(event.currentTarget.currentTime || 0)
        }
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <button
        type="button"
        className="chat-audio-button"
        onClick={toggle}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>

      <div className="chat-audio-track">
        <span
          style={{
            width: `${
              duration ? (currentTime / duration) * 100 : 0
            }%`,
          }}
        />
      </div>

      <small>
        {Math.floor(currentTime)} / {Math.ceil(duration || 0)} s
      </small>
    </div>
  );
}

export default function Chat({
  selectedHouseId,
  permission,
  isAdministrator = false,
}) {
  const canView =
    isAdministrator ||
    Boolean(permission?.can_view);

  const canCreate =
    isAdministrator ||
    Boolean(permission?.can_create) ||
    Boolean(permission?.can_manage);

  const [session, setSession] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(null);

  const [conversations, setConversations] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [selectedConversationId, setSelectedConversationId] =
    useState("");

  const [messages, setMessages] = useState([]);
  const [decryptedMessages, setDecryptedMessages] = useState({});
  const [attachmentUrls, setAttachmentUrls] = useState({});
  const [messageReceipts, setMessageReceipts] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [onlineUsers, setOnlineUsers] = useState({});
  const [failedMessages, setFailedMessages] = useState({});

  const [conversationSearch, setConversationSearch] =
    useState("");
  const [messageText, setMessageText] = useState("");
  const [replyTo, setReplyTo] = useState(null);

  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pageError, setPageError] = useState("");

  const [newConversationOpen, setNewConversationOpen] =
    useState(false);
  const [newConversation, setNewConversation] = useState(
    EMPTY_NEW_CONVERSATION
  );

  const [emojiOpen, setEmojiOpen] = useState(false);
  const [messageMenuId, setMessageMenuId] = useState("");

  const [encryptionDialogOpen, setEncryptionDialogOpen] =
    useState(false);
  const [encryptionPassphrase, setEncryptionPassphrase] =
    useState("");
  const [conversationKey, setConversationKey] = useState(null);
  const [encryptionReady, setEncryptionReady] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const recorderRef = useRef(null);
  const recorderChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const realtimeChannelRef = useRef(null);
  const typingStopTimerRef = useRef(null);
  const typingExpiryTimersRef = useRef({});

  const currentUserId = session?.user?.id || "";

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (conversation) =>
          conversation.id === selectedConversationId
      ) || null,
    [conversations, selectedConversationId]
  );

  const selectedOtherUser = useMemo(() => {
    if (!selectedConversation || selectedConversation.type !== "private") {
      return null;
    }

    return (selectedConversation.members || []).find(
      (member) => member.user_id !== currentUserId
    ) || null;
  }, [selectedConversation, currentUserId]);

  const typingText = useMemo(() => {
    const active = Object.values(typingUsers).filter(Boolean);
    if (!active.length) return "";
    if (active.length === 1) return `${active[0]} píše…`;
    if (active.length === 2) return `${active[0]} a ${active[1]} píší…`;
    return `${active.length} uživatelé píší…`;
  }, [typingUsers]);

  const filteredConversations = useMemo(() => {
    const needle = conversationSearch.trim().toLowerCase();
    if (!needle) return conversations;

    return conversations.filter((conversation) =>
      [
        getConversationTitle(conversation, currentUserId),
        getConversationSubtitle(conversation, currentUserId),
        conversation.last_message_preview,
      ].some((value) =>
        String(value || "").toLowerCase().includes(needle)
      )
    );
  }, [conversations, conversationSearch, currentUserId]);

  const availableProfiles = useMemo(
    () =>
      profiles.filter(
        (profile) => profile.id !== currentUserId
      ),
    [profiles, currentUserId]
  );

  async function loadSessionAndProfile() {
    const {
      data: { session: nextSession },
      error,
    } = await supabase.auth.getSession();

    if (error) throw error;

    setSession(nextSession || null);

    if (!nextSession?.user?.id) {
      setCurrentProfile(null);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from(PROFILES_TABLE)
      .select(
        "id, full_name, username, avatar_path, active"
      )
      .eq("id", nextSession.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    setCurrentProfile(profile || null);
  }

  async function getProfileAvatarUrl(profile) {
    if (!profile?.avatar_path) return "";

    const { data, error } = await supabase.storage
      .from("profile-photos")
      .createSignedUrl(profile.avatar_path, 60 * 60);

    if (error) return "";

    return data?.signedUrl || "";
  }

  async function loadProfiles() {
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .select(
        "id, full_name, username, avatar_path, active"
      )
      .eq("active", true)
      .order("full_name", { ascending: true });

    if (error) throw error;

    const hydrated = await Promise.all(
      (data || []).map(async (profile) => ({
        ...profile,
        avatar_url: await getProfileAvatarUrl(profile),
      }))
    );

    setProfiles(hydrated);
  }

  async function hydrateConversation(conversation) {
    const { data: memberRows, error } = await supabase
      .from(MEMBERS_TABLE)
      .select(
        "conversation_id, user_id, role, joined_at, last_read_at, archived, muted_until"
      )
      .eq("conversation_id", conversation.id);

    if (error) throw error;

    const members = (memberRows || []).map((member) => ({
      ...member,
      profile:
        profiles.find(
          (profile) => profile.id === member.user_id
        ) || null,
    }));

    return {
      ...conversation,
      members,
    };
  }

  async function loadConversations() {
    if (!currentUserId) return;

    const { data: memberships, error: membershipError } =
      await supabase
        .from(MEMBERS_TABLE)
        .select(
          "conversation_id, archived, muted_until, last_read_at"
        )
        .eq("user_id", currentUserId)
        .eq("archived", false);

    if (membershipError) throw membershipError;

    const conversationIds = (memberships || []).map(
      (membership) => membership.conversation_id
    );

    if (!conversationIds.length) {
      setConversations([]);
      return;
    }

    const { data, error } = await supabase
      .from(CONVERSATIONS_TABLE)
      .select("*")
      .in("id", conversationIds)
      .order("last_message_at", { ascending: false });

    if (error) throw error;

    const hydrated = await Promise.all(
      (data || []).map(hydrateConversation)
    );

    setConversations(hydrated);

    setSelectedConversationId((current) => {
      if (
        current &&
        hydrated.some(
          (conversation) => conversation.id === current
        )
      ) {
        return current;
      }

      return hydrated[0]?.id || "";
    });
  }

  async function loadMessageReceipts(conversationId, loadedMessages = null) {
    if (!conversationId) {
      setMessageReceipts({});
      return;
    }

    const sourceMessages = loadedMessages || messages;
    const messageIds = sourceMessages.map((message) => message.id);

    if (!messageIds.length) {
      setMessageReceipts({});
      return;
    }

    const [{ data: deliveries, error: deliveryError }, { data: reads, error: readError }] =
      await Promise.all([
        supabase
          .from(DELIVERIES_TABLE)
          .select("message_id, user_id, delivered_at")
          .in("message_id", messageIds),
        supabase
          .from(READS_TABLE)
          .select("message_id, user_id, read_at")
          .in("message_id", messageIds),
      ]);

    if (deliveryError) throw deliveryError;
    if (readError) throw readError;

    const next = {};
    for (const messageId of messageIds) {
      next[messageId] = { deliveredTo: [], readBy: [] };
    }

    for (const row of deliveries || []) {
      if (row.user_id !== currentUserId && next[row.message_id]) {
        next[row.message_id].deliveredTo.push(row.user_id);
      }
    }

    for (const row of reads || []) {
      if (row.user_id !== currentUserId && next[row.message_id]) {
        next[row.message_id].readBy.push(row.user_id);
      }
    }

    setMessageReceipts(next);
  }

  async function markConversationSeen(conversationId, loadedMessages = null) {
    if (!currentUserId || !conversationId) return;

    const sourceMessages = loadedMessages || messages;
    const unreadMessageIds = sourceMessages
      .filter((message) => message.sender_id !== currentUserId)
      .map((message) => message.id);

    const { error } = await supabase.rpc("chat_mark_conversation_seen", {
      p_conversation_id: conversationId,
      p_message_ids: unreadMessageIds,
    });

    if (error) {
      console.error("Označení zpráv jako doručených/přečtených selhalo:", error);
      throw error;
    }
  }

  async function loadMessages(conversationId, { quiet = false } = {}) {
    if (!conversationId) {
      setMessages([]);
      setDecryptedMessages({});
      setMessageReceipts({});
      return;
    }

    if (!quiet) setMessagesLoading(true);
    setPageError("");

    try {
      const { data, error } = await supabase
        .from(MESSAGES_TABLE)
        .select(
          "id, conversation_id, sender_id, message_type, ciphertext, encryption_iv, attachment_path, attachment_name, attachment_mime, attachment_size, attachment_iv, reply_to_id, edited_at, deleted_at, created_at"
        )
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(MESSAGE_PAGE_SIZE);

      if (error) throw error;

      const loaded = data || [];
      setMessages(loaded);
      setDecryptedMessages({});
      if (!quiet) setAttachmentUrls({});

      await markConversationSeen(conversationId, loaded);
      await loadMessageReceipts(conversationId, loaded);
    } catch (error) {
      console.error("Načtení zpráv selhalo:", error);
      setPageError(
        error?.message || "Zprávy se nepodařilo načíst."
      );
    } finally {
      if (!quiet) setMessagesLoading(false);
    }
  }

  function getMessageStatus(message) {
    if (failedMessages[message.id]) return "failed";

    const receipt = messageReceipts[message.id];
    if (receipt?.readBy?.length) return "read";
    if (receipt?.deliveredTo?.length) return "delivered";
    return "sent";
  }

  function getMessageStatusLabel(status) {
    if (status === "failed") return "Nedoručeno";
    if (status === "read") return "Přečteno";
    if (status === "delivered") return "Doručeno";
    return "Odesláno";
  }

  function broadcastTyping(isTyping) {
    const channel = realtimeChannelRef.current;
    if (!channel || !currentUserId) return;

    channel.send({
      type: "broadcast",
      event: "typing",
      payload: {
        userId: currentUserId,
        name:
          currentProfile?.full_name ||
          currentProfile?.username ||
          "Uživatel",
        isTyping,
      },
    });
  }

  function handleTypingChange(value) {
    setMessageText(value);
    broadcastTyping(Boolean(value.trim()));

    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
    }

    typingStopTimerRef.current = window.setTimeout(() => {
      broadcastTyping(false);
    }, 1800);
  }

  async function prepareEncryption(conversation) {
    setConversationKey(null);
    setEncryptionReady(false);

    if (!conversation?.id || !conversation?.encryption_salt) {
      return;
    }

    const stored = getStoredPassphrase(conversation.id);

    if (!stored) {
      setEncryptionPassphrase("");
      setEncryptionDialogOpen(true);
      return;
    }

    try {
      const key = await deriveConversationKey(
        stored,
        conversation.encryption_salt
      );

      setConversationKey(key);
      setEncryptionReady(true);
    } catch (error) {
      console.error("Příprava šifrování selhala:", error);
      setEncryptionDialogOpen(true);
    }
  }

  async function decryptVisibleMessages() {
    if (!conversationKey || !encryptionReady) return;

    const next = {};

    for (const message of messages) {
      if (message.deleted_at) {
        next[message.id] = "Zpráva byla odstraněna.";
        continue;
      }

      if (!message.ciphertext || !message.encryption_iv) {
        next[message.id] = "";
        continue;
      }

      try {
        next[message.id] = await decryptText(
          message.ciphertext,
          message.encryption_iv,
          conversationKey
        );
      } catch {
        next[message.id] =
          "🔒 Zprávu se nepodařilo dešifrovat. Pravděpodobně je použité jiné heslo konverzace.";
      }
    }

    setDecryptedMessages(next);
  }

  async function unlockConversation(event) {
    event.preventDefault();

    if (
      !selectedConversation?.id ||
      !selectedConversation?.encryption_salt ||
      !encryptionPassphrase
    ) {
      return;
    }

    try {
      const key = await deriveConversationKey(
        encryptionPassphrase,
        selectedConversation.encryption_salt
      );

      const testMessage = messages.find(
        (message) =>
          message.ciphertext &&
          message.encryption_iv &&
          !message.deleted_at
      );

      if (testMessage) {
        await decryptText(
          testMessage.ciphertext,
          testMessage.encryption_iv,
          key
        );
      }

      storePassphrase(
        selectedConversation.id,
        encryptionPassphrase
      );

      setConversationKey(key);
      setEncryptionReady(true);
      setEncryptionDialogOpen(false);
      setPageError("");
    } catch {
      setPageError(
        "Zadané heslo konverzace není správné."
      );
    }
  }

  async function createConversation(event) {
    event.preventDefault();

    if (!canCreate || !currentUserId) return;

    const participantIds = Array.from(
      new Set([
        currentUserId,
        ...newConversation.participantIds,
      ])
    );

    if (
      newConversation.type === "private" &&
      participantIds.length !== 2
    ) {
      setPageError(
        "Pro soukromý chat vyberte právě jednoho uživatele."
      );
      return;
    }

    if (
      newConversation.type === "group" &&
      participantIds.length < 3
    ) {
      setPageError(
        "Pro skupinový chat vyberte alespoň dva další uživatele."
      );
      return;
    }

    if (!encryptionPassphrase.trim()) {
      setPageError(
        "Nastavte heslo konverzace. Bez něj nelze vytvořit šifrovaný chat."
      );
      return;
    }

    setSending(true);
    setPageError("");

    try {
      const salt = crypto.getRandomValues(
        new Uint8Array(16)
      );

      const conversationPayload = {
        id: createId(),
        type: newConversation.type,
        title:
          newConversation.type === "private"
            ? null
            : newConversation.title.trim() ||
              "Nová skupina",
        house_id:
          newConversation.type === "house"
            ? selectedHouseId || null
            : null,
        created_by: currentUserId,
        encryption_salt: bytesToBase64(salt),
        last_message_at: new Date().toISOString(),
      };

      const { data: created, error } = await supabase
        .from(CONVERSATIONS_TABLE)
        .insert(conversationPayload)
        .select("*")
        .single();

      if (error) throw error;

      const memberRows = participantIds.map((userId) => ({
        conversation_id: created.id,
        user_id: userId,
        role:
          userId === currentUserId ? "owner" : "member",
        joined_at: new Date().toISOString(),
        last_read_at: new Date().toISOString(),
        archived: false,
      }));

      const { error: membersError } = await supabase
        .from(MEMBERS_TABLE)
        .insert(memberRows);

      if (membersError) throw membersError;

      storePassphrase(
        created.id,
        encryptionPassphrase.trim()
      );

      setNewConversation(EMPTY_NEW_CONVERSATION);
      setEncryptionPassphrase("");
      setNewConversationOpen(false);

      await loadConversations();
      setSelectedConversationId(created.id);
    } catch (error) {
      console.error("Vytvoření konverzace selhalo:", error);
      setPageError(
        error?.message ||
          "Konverzaci se nepodařilo vytvořit."
      );
    } finally {
      setSending(false);
    }
  }

  async function sendMessage({
    text = "",
    file = null,
    recordedBlob = null,
  } = {}) {
    if (
      !selectedConversation?.id ||
      !currentUserId ||
      !conversationKey ||
      !encryptionReady ||
      sending
    ) {
      return;
    }

    const cleanText = text.trim();
    const attachmentFile =
      file ||
      (recordedBlob
        ? new File(
            [recordedBlob],
            `hlasova-zprava-${Date.now()}.webm`,
            {
              type: recordedBlob.type || "audio/webm",
            }
          )
        : null);

    if (!cleanText && !attachmentFile) return;

    if (
      attachmentFile &&
      attachmentFile.size > MAX_UPLOAD_SIZE
    ) {
      setPageError(
        "Příloha může mít nejvýše 25 MB."
      );
      return;
    }

    setSending(true);
    setPageError("");

    const optimisticId = `local-${createId()}`;
    const optimisticMessage = {
      id: optimisticId,
      conversation_id: selectedConversation.id,
      sender_id: currentUserId,
      message_type: attachmentFile ? detectMessageType(attachmentFile) : "text",
      ciphertext: null,
      encryption_iv: null,
      attachment_path: null,
      attachment_name: attachmentFile?.name || null,
      attachment_mime: attachmentFile?.type || null,
      attachment_size: attachmentFile?.size || null,
      attachment_iv: null,
      reply_to_id: replyTo?.id || null,
      edited_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      _optimistic: true,
    };

    setMessages((current) => [...current, optimisticMessage]);
    setDecryptedMessages((current) => ({
      ...current,
      [optimisticId]: cleanText || (attachmentFile ? "" : "Odesílám…"),
    }));

    try {
      const encryptedText = await encryptText(
        cleanText,
        conversationKey
      );

      let attachmentPath = null;
      let attachmentIv = null;
      let attachmentName = null;
      let attachmentMime = null;
      let attachmentSize = null;
      let messageType = "text";

      if (attachmentFile) {
        const encryptedFile = await encryptFile(
          attachmentFile,
          conversationKey
        );

        const safeName = cleanAttachmentName(
          attachmentFile.name
        );

        attachmentPath = `${
          selectedConversation.id
        }/${createId()}-${safeName}.encrypted`;

        const { error: uploadError } = await supabase.storage
          .from(CHAT_BUCKET)
          .upload(
            attachmentPath,
            encryptedFile.blob,
            {
              contentType: "application/octet-stream",
              cacheControl: "3600",
              upsert: false,
            }
          );

        if (uploadError) throw uploadError;

        attachmentIv = encryptedFile.iv;
        attachmentName = attachmentFile.name;
        attachmentMime = attachmentFile.type;
        attachmentSize = attachmentFile.size;
        messageType = detectMessageType(
          attachmentFile
        );
      }

      const messagePayload = {
        conversation_id: selectedConversation.id,
        sender_id: currentUserId,
        message_type: messageType,
        ciphertext: encryptedText.ciphertext,
        encryption_iv: encryptedText.iv,
        attachment_path: attachmentPath,
        attachment_name: attachmentName,
        attachment_mime: attachmentMime,
        attachment_size: attachmentSize,
        attachment_iv: attachmentIv,
        reply_to_id: replyTo?.id || null,
        created_at: new Date().toISOString(),
      };

      const { data: createdMessage, error } = await supabase
        .from(MESSAGES_TABLE)
        .insert(messagePayload)
        .select(
          "id, conversation_id, sender_id, message_type, ciphertext, encryption_iv, attachment_path, attachment_name, attachment_mime, attachment_size, attachment_iv, reply_to_id, edited_at, deleted_at, created_at"
        )
        .single();

      if (error) throw error;

      if (createdMessage) {
        setMessages((current) =>
          current.map((message) =>
            message.id === optimisticId ? createdMessage : message
          )
        );
        setDecryptedMessages((current) => {
          const next = { ...current };
          delete next[optimisticId];
          next[createdMessage.id] = cleanText;
          return next;
        });
        setMessageReceipts((current) => ({
          ...current,
          [createdMessage.id]: { deliveredTo: [], readBy: [] },
        }));
      }

      broadcastTyping(false);
      setMessageText("");
      setReplyTo(null);
      setRecordedAudio(null);
      setRecordingSeconds(0);

      await loadMessages(selectedConversation.id, { quiet: true });
      await loadConversations();
    } catch (error) {
      console.error("Odeslání zprávy selhalo:", error);
      setFailedMessages((current) => ({
        ...current,
        [optimisticId]: true,
      }));
      setPageError(
        error?.message ||
          "Zprávu se nepodařilo odeslat."
      );
    } finally {
      setSending(false);
    }
  }

  async function loadAttachment(message) {
    if (
      !message?.attachment_path ||
      !message?.attachment_iv ||
      !conversationKey
    ) {
      return;
    }

    if (attachmentUrls[message.id]) return;

    try {
      const { data: encryptedBlob, error } =
        await supabase.storage
          .from(CHAT_BUCKET)
          .download(message.attachment_path);

      if (error) throw error;

      const decryptedBlob = await decryptFile(
        encryptedBlob,
        message.attachment_iv,
        conversationKey,
        message.attachment_mime
      );

      const url = URL.createObjectURL(decryptedBlob);

      setAttachmentUrls((current) => ({
        ...current,
        [message.id]: url,
      }));
    } catch (error) {
      console.error("Načtení přílohy selhalo:", error);
      setPageError(
        "Přílohu se nepodařilo dešifrovat."
      );
    }
  }

  async function addReaction(messageId, emoji) {
    if (!currentUserId) return;

    const { data: existing } = await supabase
      .from(REACTIONS_TABLE)
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", currentUserId)
      .eq("emoji", emoji)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from(REACTIONS_TABLE)
        .delete()
        .eq("id", existing.id);
    } else {
      await supabase.from(REACTIONS_TABLE).insert({
        message_id: messageId,
        user_id: currentUserId,
        emoji,
      });
    }

    setMessageMenuId("");
  }

  async function deleteMessage(message) {
    if (
      message?.sender_id !== currentUserId &&
      !isAdministrator
    ) {
      return;
    }

    const { error } = await supabase
      .from(MESSAGES_TABLE)
      .update({
        deleted_at: new Date().toISOString(),
        ciphertext: null,
        encryption_iv: null,
      })
      .eq("id", message.id);

    if (error) {
      setPageError(
        error.message || "Zprávu se nepodařilo odstranit."
      );
      return;
    }

    if (message.attachment_path) {
      await supabase.storage
        .from(CHAT_BUCKET)
        .remove([message.attachment_path]);
    }

    setMessageMenuId("");
    await loadMessages(selectedConversationId);
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPageError(
        "Tento prohlížeč nepodporuje nahrávání hlasových zpráv."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const supportedTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];

      const mimeType =
        supportedTypes.find((type) =>
          MediaRecorder.isTypeSupported(type)
        ) || "";

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      recorderChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          recorderChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(
          recorderChunksRef.current,
          {
            type: recorder.mimeType || "audio/webm",
          }
        );

        setRecordedAudio(blob);

        stream.getTracks().forEach((track) =>
          track.stop()
        );
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = window.setInterval(
        () =>
          setRecordingSeconds((current) => current + 1),
        1000
      );
    } catch (error) {
      setPageError(
        error?.message ||
          "Mikrofon se nepodařilo zpřístupnit."
      );
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    setRecording(false);
  }

  function cancelRecording() {
    const recorder = recorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        recorder.stream
          ?.getTracks()
          ?.forEach((track) => track.stop());
      };

      recorder.stop();
    }

    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    setRecording(false);
    setRecordingSeconds(0);
    setRecordedAudio(null);
  }

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function initialize() {
      setLoading(true);

      try {
        await loadSessionAndProfile();
        if (!mounted) return;
      } catch (error) {
        setPageError(
          error?.message ||
            "Chat se nepodařilo inicializovat."
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, [canView]);

  useEffect(() => {
    if (!currentUserId) return;

    async function loadInitialData() {
      try {
        await loadProfiles();
      } catch (error) {
        setPageError(
          error?.message ||
            "Uživatele se nepodařilo načíst."
        );
      }
    }

    loadInitialData();
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId || !profiles.length) return;

    loadConversations();
  }, [currentUserId, profiles.length]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    loadMessages(selectedConversationId);
  }, [selectedConversationId]);

  useEffect(() => {
    prepareEncryption(selectedConversation);
  }, [
    selectedConversation?.id,
    selectedConversation?.encryption_salt,
  ]);

  useEffect(() => {
    decryptVisibleMessages();
  }, [messages, conversationKey, encryptionReady]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, decryptedMessages]);

  useEffect(() => {
    if (!selectedConversationId || !currentUserId) return undefined;

    setTypingUsers({});
    setOnlineUsers({});

    const channel = supabase
      .channel(`chat-${selectedConversationId}`, {
        config: {
          presence: { key: currentUserId },
          broadcast: { self: false },
        },
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: MESSAGES_TABLE,
          filter: `conversation_id=eq.${selectedConversationId}`,
        },
        () => {
          loadMessages(selectedConversationId, { quiet: true });
          loadConversations();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: REACTIONS_TABLE },
        () => loadMessages(selectedConversationId, { quiet: true })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: DELIVERIES_TABLE },
        () => loadMessageReceipts(selectedConversationId)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: READS_TABLE },
        () => loadMessageReceipts(selectedConversationId)
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!payload?.userId || payload.userId === currentUserId) return;

        if (typingExpiryTimersRef.current[payload.userId]) {
          window.clearTimeout(typingExpiryTimersRef.current[payload.userId]);
        }

        setTypingUsers((current) => {
          const next = { ...current };
          if (payload.isTyping) next[payload.userId] = payload.name || "Uživatel";
          else delete next[payload.userId];
          return next;
        });

        if (payload.isTyping) {
          typingExpiryTimersRef.current[payload.userId] = window.setTimeout(() => {
            setTypingUsers((current) => {
              const next = { ...current };
              delete next[payload.userId];
              return next;
            });
          }, 3000);
        }
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const next = {};
        Object.entries(state).forEach(([userId, entries]) => {
          next[userId] = Boolean(entries?.length);
        });
        setOnlineUsers(next);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          realtimeChannelRef.current = channel;
          await channel.track({
            userId: currentUserId,
            onlineAt: new Date().toISOString(),
          });
        }
      });

    return () => {
      broadcastTyping(false);
      realtimeChannelRef.current = null;
      Object.values(typingExpiryTimersRef.current).forEach((timer) =>
        window.clearTimeout(timer)
      );
      typingExpiryTimersRef.current = {};
      supabase.removeChannel(channel);
    };
  }, [selectedConversationId, currentUserId]);

  useEffect(() => {
    return () => {
      Object.values(attachmentUrls).forEach((url) => {
        if (url?.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      });

      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
      }

      if (typingStopTimerRef.current) {
        window.clearTimeout(typingStopTimerRef.current);
      }
    };
  }, [attachmentUrls]);

  if (!canView) {
    return (
      <div className="chat-no-access">
        Nemáte oprávnění zobrazit chat.
      </div>
    );
  }

  return (
    <div className="chat-page">
      <style>{`
        .chat-page {
          height: calc(100vh - 118px);
          min-height: 620px;
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr);
          overflow: hidden;
          border: 1px solid #dce5e0;
          border-radius: 22px;
          background: #ffffff;
          color: #17231f;
          box-shadow: 0 18px 48px rgba(19, 49, 38, 0.08);
        }

        .chat-page * {
          box-sizing: border-box;
        }

        .chat-sidebar {
          min-width: 0;
          display: flex;
          flex-direction: column;
          border-right: 1px solid #e3eae6;
          background: #f8fbf9;
        }

        .chat-sidebar-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 18px;
        }

        .chat-sidebar-head h1 {
          margin: 0;
          color: #111827;
          font-size: 23px;
          letter-spacing: -0.03em;
        }

        .chat-icon-button {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border: 1px solid #dce6e1;
          border-radius: 13px;
          background: #ffffff;
          color: #476057;
          cursor: pointer;
        }

        .chat-icon-button:hover {
          border-color: #bcd7cc;
          background: #edf8f3;
          color: #087457;
        }

        .chat-search {
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 0 14px 14px;
          min-height: 43px;
          padding: 0 12px;
          border: 1px solid #dce5e0;
          border-radius: 13px;
          background: #ffffff;
          color: #7a8c84;
        }

        .chat-search input {
          min-width: 0;
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: #17231f;
        }

        .chat-conversations {
          min-height: 0;
          flex: 1;
          overflow-y: auto;
          padding: 0 8px 12px;
        }

        .chat-conversation {
          width: 100%;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 11px;
          padding: 11px 10px;
          border: 0;
          border-radius: 14px;
          background: transparent;
          color: #273a33;
          text-align: left;
          cursor: pointer;
        }

        .chat-conversation:hover {
          background: #edf5f1;
        }

        .chat-conversation.active {
          background: #dff3ea;
        }

        .chat-avatar {
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          overflow: hidden;
          border-radius: 15px;
          background: #dcefe7;
          color: #087457;
          font-size: 12px;
          font-weight: 900;
        }

        .chat-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .chat-conversation-copy {
          min-width: 0;
        }

        .chat-conversation-copy strong,
        .chat-conversation-copy span {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .chat-conversation-copy strong {
          color: #15241e;
          font-size: 13px;
        }

        .chat-conversation-copy span {
          margin-top: 4px;
          color: #74867e;
          font-size: 10px;
        }

        .chat-conversation-meta {
          align-self: start;
          color: #87978f;
          font-size: 9px;
        }

        .chat-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          background:
            radial-gradient(circle at 80% 0%, rgba(16,185,129,.06), transparent 28%),
            #ffffff;
        }

        .chat-main-head {
          min-height: 72px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 12px 18px;
          border-bottom: 1px solid #e5ece8;
          background: rgba(255,255,255,.96);
        }

        .chat-main-user {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .chat-main-user > div {
          min-width: 0;
        }

        .chat-main-user strong,
        .chat-main-user span {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .chat-main-user strong {
          color: #17231f;
          font-size: 14px;
        }

        .chat-main-user span {
          margin-top: 3px;
          color: #72847c;
          font-size: 10px;
        }

        .chat-encryption-banner {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 8px 14px;
          border-bottom: 1px solid #d8ebe2;
          background: #edf9f4;
          color: #176a4e;
          font-size: 10px;
          text-align: center;
        }

        .chat-encryption-banner.warning {
          border-color: #f1d8a6;
          background: #fff8e8;
          color: #8a5a09;
        }

        .chat-alert {
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 12px 16px 0;
          padding: 10px 12px;
          border: 1px solid #fecaca;
          border-radius: 12px;
          background: #fef2f2;
          color: #991b1b;
          font-size: 11px;
        }

        .chat-messages {
          min-height: 0;
          flex: 1;
          overflow-y: auto;
          padding: 18px 18px 10px;
        }

        .chat-message-row {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          margin-bottom: 12px;
        }

        .chat-message-row.mine {
          justify-content: flex-end;
        }

        .chat-message-bubble {
          position: relative;
          max-width: min(72%, 680px);
          padding: 10px 12px 7px;
          border: 1px solid #dce6e1;
          border-radius: 16px 16px 16px 5px;
          background: #ffffff;
          color: #1e3028;
          box-shadow: 0 5px 16px rgba(19, 52, 40, 0.055);
        }

        .chat-message-row.mine .chat-message-bubble {
          border-color: #bfe2d3;
          border-radius: 16px 16px 5px 16px;
          background: #dcf6e9;
        }

        .chat-message-sender {
          display: block;
          margin-bottom: 5px;
          color: #087457;
          font-size: 9px;
          font-weight: 850;
        }

        .chat-reply-preview {
          margin-bottom: 7px;
          padding: 7px 9px;
          border-left: 3px solid #10b981;
          border-radius: 8px;
          background: rgba(255,255,255,.58);
          color: #52665d;
          font-size: 10px;
        }

        .chat-message-text {
          margin: 0;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font-size: 13px;
          line-height: 1.5;
        }

        .chat-message-meta {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 5px;
          margin-top: 5px;
          color: #7c8d85;
          font-size: 8px;
        }

        .chat-delivery-status {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          white-space: nowrap;
        }

        .chat-delivery-status.read {
          color: #0b8f68;
        }

        .chat-delivery-status.failed {
          color: #dc2626;
        }

        .chat-typing-label {
          color: #0b8f68 !important;
          font-weight: 750;
        }

        .chat-typing-bubble {
          width: fit-content;
          display: flex;
          align-items: center;
          gap: 4px;
          margin: 2px 0 12px 54px;
          padding: 10px 12px;
          border: 1px solid #dce6e1;
          border-radius: 16px 16px 16px 5px;
          background: #ffffff;
          color: #6d7f77;
          box-shadow: 0 5px 16px rgba(19, 52, 40, 0.055);
        }

        .chat-typing-bubble > span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #789087;
          animation: chat-typing-dot 1.2s infinite ease-in-out;
        }

        .chat-typing-bubble > span:nth-child(2) { animation-delay: .15s; }
        .chat-typing-bubble > span:nth-child(3) { animation-delay: .3s; }
        .chat-typing-bubble small { margin-left: 4px; font-size: 9px; }

        .chat-message-actions {
          position: absolute;
          top: -12px;
          right: 8px;
          display: none;
          gap: 4px;
          padding: 3px;
          border: 1px solid #dce5e0;
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 9px 22px rgba(20, 49, 39, .12);
        }

        .chat-message-bubble:hover .chat-message-actions {
          display: flex;
        }

        .chat-message-actions button {
          width: 28px;
          height: 28px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: #5e7168;
          cursor: pointer;
        }

        .chat-message-actions button:hover {
          background: #edf6f2;
          color: #087457;
        }

        .chat-message-menu {
          position: absolute;
          right: 0;
          bottom: calc(100% + 8px);
          z-index: 20;
          width: 210px;
          padding: 7px;
          border: 1px solid #dce5e0;
          border-radius: 14px;
          background: #ffffff;
          box-shadow: 0 20px 50px rgba(15, 40, 30, .18);
        }

        .chat-reaction-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 4px;
          padding-bottom: 6px;
          border-bottom: 1px solid #edf1ef;
        }

        .chat-reaction-row button {
          min-height: 34px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          cursor: pointer;
        }

        .chat-reaction-row button:hover {
          background: #edf6f2;
        }

        .chat-menu-action {
          width: 100%;
          min-height: 38px;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 0 9px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: #33483f;
          cursor: pointer;
        }

        .chat-menu-action:hover {
          background: #edf6f2;
        }

        .chat-menu-action.danger {
          color: #be123c;
        }

        .chat-image {
          max-width: 320px;
          max-height: 360px;
          display: block;
          margin-top: 7px;
          border-radius: 12px;
          object-fit: cover;
          cursor: pointer;
        }

        .chat-file {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 7px;
          padding: 10px;
          border: 1px solid rgba(84,108,98,.14);
          border-radius: 12px;
          background: rgba(255,255,255,.6);
        }

        .chat-file > div {
          min-width: 0;
        }

        .chat-file strong,
        .chat-file span {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .chat-file strong {
          font-size: 11px;
        }

        .chat-file span {
          margin-top: 3px;
          color: #74867e;
          font-size: 9px;
        }

        .chat-audio {
          min-width: 250px;
          display: flex;
          align-items: center;
          gap: 9px;
          margin-top: 7px;
        }

        .chat-audio-button {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border: 0;
          border-radius: 50%;
          background: #0b8f68;
          color: #ffffff;
          cursor: pointer;
        }

        .chat-audio-track {
          height: 5px;
          flex: 1;
          overflow: hidden;
          border-radius: 999px;
          background: #cbd8d2;
        }

        .chat-audio-track span {
          height: 100%;
          display: block;
          border-radius: inherit;
          background: #0b8f68;
        }

        .chat-audio small {
          color: #6d7f77;
          font-size: 8px;
        }

        .chat-composer-wrap {
          position: relative;
          padding: 10px 14px 14px;
          border-top: 1px solid #e4ebe7;
          background: rgba(255,255,255,.96);
        }

        .chat-reply-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
          padding: 9px 11px;
          border-left: 3px solid #10b981;
          border-radius: 10px;
          background: #edf8f3;
          color: #476057;
          font-size: 10px;
        }

        .chat-composer {
          display: grid;
          grid-template-columns: auto auto minmax(0, 1fr) auto auto;
          align-items: end;
          gap: 7px;
          padding: 7px;
          border: 1px solid #dce5e0;
          border-radius: 17px;
          background: #ffffff;
        }

        .chat-composer textarea {
          min-height: 38px;
          max-height: 130px;
          padding: 9px 7px 7px;
          border: 0;
          outline: 0;
          resize: none;
          background: transparent;
          color: #17231f;
          font: inherit;
          font-size: 13px;
          line-height: 1.45;
        }

        .chat-send-button {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 13px;
          background: #0b8f68;
          color: #ffffff;
          cursor: pointer;
        }

        .chat-send-button:disabled {
          cursor: not-allowed;
          opacity: .45;
        }

        .chat-emoji-picker {
          position: absolute;
          left: 60px;
          bottom: 72px;
          z-index: 30;
          display: grid;
          grid-template-columns: repeat(4, 42px);
          gap: 5px;
          padding: 8px;
          border: 1px solid #dce5e0;
          border-radius: 14px;
          background: #ffffff;
          box-shadow: 0 20px 50px rgba(15, 40, 30, .18);
        }

        .chat-emoji-picker button {
          height: 40px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          font-size: 20px;
          cursor: pointer;
        }

        .chat-emoji-picker button:hover {
          background: #edf6f2;
        }

        .chat-recording {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 9px 11px;
          border: 1px solid #f2c8ce;
          border-radius: 14px;
          background: #fff2f4;
          color: #9f1239;
        }

        .chat-recording > div {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .chat-recording-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #e11d48;
          animation: chat-pulse 1.2s infinite;
        }

        .chat-recorded-preview {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
          padding: 9px 11px;
          border: 1px solid #dce5e0;
          border-radius: 13px;
          background: #f8fbf9;
        }

        .chat-empty {
          min-height: 100%;
          display: grid;
          place-items: center;
          padding: 30px;
          text-align: center;
          color: #74867e;
        }

        .chat-empty svg {
          margin-bottom: 12px;
          color: #9db4aa;
        }

        .chat-empty h2 {
          margin: 0;
          color: #263a33;
        }

        .chat-empty p {
          max-width: 440px;
          line-height: 1.6;
        }

        .chat-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(7,24,20,.62);
          backdrop-filter: blur(6px);
        }

        .chat-modal {
          width: min(620px, 100%);
          max-height: calc(100vh - 36px);
          overflow-y: auto;
          border: 1px solid #dce5e0;
          border-radius: 22px;
          background: #ffffff;
          box-shadow: 0 30px 90px rgba(0,0,0,.28);
        }

        .chat-modal-head {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          padding: 19px 20px;
          border-bottom: 1px solid #e5ece8;
          background: #ffffff;
        }

        .chat-modal-head h2 {
          margin: 5px 0 0;
          color: #17231f;
        }

        .chat-modal-body {
          display: grid;
          gap: 15px;
          padding: 20px;
        }

        .chat-field {
          display: grid;
          gap: 7px;
        }

        .chat-field label {
          color: #30453c;
          font-size: 11px;
          font-weight: 850;
        }

        .chat-field input,
        .chat-field select {
          min-height: 44px;
          padding: 0 12px;
          border: 1px solid #d9e3de;
          border-radius: 12px;
          outline: 0;
          background: #ffffff;
          color: #17231f;
        }

        .chat-profile-picker {
          max-height: 280px;
          overflow-y: auto;
          display: grid;
          gap: 7px;
          padding: 8px;
          border: 1px solid #dfe7e3;
          border-radius: 14px;
          background: #f8fbf9;
        }

        .chat-profile-option {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px;
          border-radius: 11px;
          background: #ffffff;
          cursor: pointer;
        }

        .chat-profile-option:hover {
          background: #edf6f2;
        }

        .chat-profile-option input {
          width: 17px;
          height: 17px;
        }

        .chat-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 9px;
          padding-top: 4px;
        }

        .chat-button {
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 14px;
          border: 0;
          border-radius: 12px;
          background: #0b8f68;
          color: #ffffff;
          font: inherit;
          font-size: 12px;
          font-weight: 850;
          cursor: pointer;
        }

        .chat-button.secondary {
          border: 1px solid #dce5e0;
          background: #ffffff;
          color: #40564d;
        }

        .chat-button:disabled {
          cursor: not-allowed;
          opacity: .5;
        }

        @keyframes chat-pulse {
          0%,100% { opacity: 1; }
          50% { opacity: .35; }
        }

        @keyframes chat-typing-dot {
          0%, 60%, 100% { transform: translateY(0); opacity: .45; }
          30% { transform: translateY(-4px); opacity: 1; }
        }

        @media (max-width: 860px) {
          .chat-page {
            grid-template-columns: 1fr;
            height: calc(100vh - 92px);
            border-radius: 0;
          }

          .chat-sidebar {
            display: ${
              selectedConversationId ? "none" : "flex"
            };
          }

          .chat-main {
            display: ${
              selectedConversationId ? "flex" : "none"
            };
          }

          .chat-mobile-back {
            display: grid !important;
          }

          .chat-message-bubble {
            max-width: 86%;
          }
        }

        @media (min-width: 861px) {
          .chat-mobile-back {
            display: none !important;
          }
        }

        @media (max-width: 560px) {
          .chat-page {
            min-height: 560px;
          }

          .chat-main-head {
            padding-inline: 10px;
          }

          .chat-messages {
            padding-inline: 10px;
          }

          .chat-composer-wrap {
            padding-inline: 8px;
          }

          .chat-composer {
            grid-template-columns: auto minmax(0, 1fr) auto;
          }

          .chat-composer .hide-mobile {
            display: none;
          }

          .chat-message-bubble {
            max-width: 92%;
          }

          .chat-image {
            max-width: 250px;
          }
        }
      `}</style>

      <aside className="chat-sidebar">
        <div className="chat-sidebar-head">
          <h1>Chat</h1>

          <button
            type="button"
            className="chat-icon-button"
            onClick={() => {
              setEncryptionPassphrase("");
              setNewConversationOpen(true);
            }}
            disabled={!canCreate}
            aria-label="Nová konverzace"
          >
            <Plus size={18} />
          </button>
        </div>

        <label className="chat-search">
          <Search size={16} />
          <input
            type="search"
            placeholder="Hledat konverzaci…"
            value={conversationSearch}
            onChange={(event) =>
              setConversationSearch(event.target.value)
            }
          />
        </label>

        <div className="chat-conversations">
          {loading ? (
            <div className="chat-empty">
              <LoaderCircle size={26} />
              <p>Načítám chat…</p>
            </div>
          ) : filteredConversations.length ? (
            filteredConversations.map((conversation) => {
              const avatar = getConversationAvatar(
                conversation,
                currentUserId
              );

              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={`chat-conversation ${
                    selectedConversationId === conversation.id
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    setSelectedConversationId(
                      conversation.id
                    )
                  }
                >
                  <span className="chat-avatar">
                    {avatar?.url ? (
                      <img src={avatar.url} alt="" />
                    ) : (
                      avatar?.initials
                    )}
                  </span>

                  <span className="chat-conversation-copy">
                    <strong>
                      {getConversationTitle(
                        conversation,
                        currentUserId
                      )}
                    </strong>
                    <span>
                      {conversation.last_message_preview ||
                        getConversationSubtitle(
                          conversation,
                          currentUserId
                        )}
                    </span>
                  </span>

                  <span className="chat-conversation-meta">
                    {formatConversationTime(
                      conversation.last_message_at
                    )}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="chat-empty">
              <MessageCircle size={34} />
              <h2>Zatím žádný chat</h2>
              <p>
                Vytvořte soukromou nebo skupinovou
                konverzaci.
              </p>
            </div>
          )}
        </div>
      </aside>

      <main className="chat-main">
        {selectedConversation ? (
          <>
            <header className="chat-main-head">
              <div className="chat-main-user">
                <button
                  type="button"
                  className="chat-icon-button chat-mobile-back"
                  onClick={() =>
                    setSelectedConversationId("")
                  }
                >
                  <ChevronLeft size={19} />
                </button>

                <span className="chat-avatar">
                  {getConversationAvatar(
                    selectedConversation,
                    currentUserId
                  )?.url ? (
                    <img
                      src={
                        getConversationAvatar(
                          selectedConversation,
                          currentUserId
                        ).url
                      }
                      alt=""
                    />
                  ) : (
                    getConversationAvatar(
                      selectedConversation,
                      currentUserId
                    )?.initials
                  )}
                </span>

                <div>
                  <strong>
                    {getConversationTitle(
                      selectedConversation,
                      currentUserId
                    )}
                  </strong>
                  <span className={typingText ? "chat-typing-label" : ""}>
                    {typingText ||
                      (selectedConversation.type === "private" &&
                      selectedOtherUser?.user_id
                        ? onlineUsers[selectedOtherUser.user_id]
                          ? "Online"
                          : "Offline"
                        : getConversationSubtitle(
                            selectedConversation,
                            currentUserId
                          ))}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="chat-icon-button"
                aria-label="Informace o konverzaci"
              >
                <MoreVertical size={18} />
              </button>
            </header>

            <div
              className={`chat-encryption-banner ${
                encryptionReady ? "" : "warning"
              }`}
            >
              <LockKeyhole size={14} />

              {encryptionReady
                ? "Zprávy a přílohy jsou šifrovány na vašem zařízení. Supabase ukládá pouze šifrovaná data."
                : "Konverzace je uzamčena. Pro čtení a odesílání zpráv zadejte heslo konverzace."}
            </div>

            {pageError && (
              <div className="chat-alert">
                <CircleAlert size={16} />
                {pageError}
              </div>
            )}

            <section className="chat-messages">
              {messagesLoading ? (
                <div className="chat-empty">
                  <LoaderCircle size={25} />
                  <p>Načítám zprávy…</p>
                </div>
              ) : messages.length ? (
                messages.map((message) => {
                  const mine =
                    message.sender_id === currentUserId;
                  const sender = profiles.find(
                    (profile) =>
                      profile.id === message.sender_id
                  );
                  const attachmentUrl =
                    attachmentUrls[message.id];

                  return (
                    <div
                      className={`chat-message-row ${
                        mine ? "mine" : ""
                      }`}
                      key={message.id}
                    >
                      {!mine && (
                        <span className="chat-avatar">
                          {sender?.avatar_url ? (
                            <img
                              src={sender.avatar_url}
                              alt=""
                            />
                          ) : (
                            getInitials(
                              sender?.full_name,
                              sender?.username
                            )
                          )}
                        </span>
                      )}

                      <article className="chat-message-bubble">
                        {!mine && (
                          <span className="chat-message-sender">
                            {sender?.full_name ||
                              sender?.username ||
                              "Uživatel"}
                          </span>
                        )}

                        {message.reply_to_id && (
                          <div className="chat-reply-preview">
                            Odpověď na předchozí zprávu
                          </div>
                        )}

                        <p className="chat-message-text">
                          {decryptedMessages[message.id] ??
                            (encryptionReady
                              ? "Dešifruji…"
                              : "🔒 Šifrovaná zpráva")}
                        </p>

                        {message.attachment_path && (
                          <>
                            {!attachmentUrl ? (
                              <button
                                type="button"
                                className="chat-file"
                                onClick={() =>
                                  loadAttachment(message)
                                }
                              >
                                <File size={20} />
                                <div>
                                  <strong>
                                    {message.attachment_name ||
                                      "Šifrovaná příloha"}
                                  </strong>
                                  <span>
                                    Kliknutím dešifrovat a
                                    načíst
                                  </span>
                                </div>
                              </button>
                            ) : message.message_type ===
                              "image" ? (
                              <img
                                className="chat-image"
                                src={attachmentUrl}
                                alt={
                                  message.attachment_name ||
                                  "Fotografie"
                                }
                                onClick={() =>
                                  window.open(
                                    attachmentUrl,
                                    "_blank",
                                    "noopener,noreferrer"
                                  )
                                }
                              />
                            ) : message.message_type ===
                              "audio" ? (
                              <AudioMessage
                                src={attachmentUrl}
                              />
                            ) : message.message_type ===
                              "video" ? (
                              <video
                                className="chat-image"
                                src={attachmentUrl}
                                controls
                              />
                            ) : (
                              <a
                                className="chat-file"
                                href={attachmentUrl}
                                download={
                                  message.attachment_name ||
                                  "soubor"
                                }
                              >
                                <FileText size={20} />
                                <div>
                                  <strong>
                                    {message.attachment_name ||
                                      "Soubor"}
                                  </strong>
                                  <span>Stáhnout soubor</span>
                                </div>
                              </a>
                            )}
                          </>
                        )}

                        <div className="chat-message-meta">
                          <span>{formatTime(message.created_at)}</span>
                          {mine && (() => {
                            const status = getMessageStatus(message);
                            return (
                              <span
                                className={`chat-delivery-status ${status}`}
                                title={getMessageStatusLabel(status)}
                                aria-label={getMessageStatusLabel(status)}
                              >
                                {status === "failed" ? (
                                  <CircleAlert size={12} />
                                ) : status === "sent" ? (
                                  <Check size={12} />
                                ) : (
                                  <CheckCheck size={12} />
                                )}
                                <span>{getMessageStatusLabel(status)}</span>
                              </span>
                            );
                          })()}
                        </div>

                        <div className="chat-message-actions">
                          <button
                            type="button"
                            onClick={() =>
                              setReplyTo(message)
                            }
                            aria-label="Odpovědět"
                          >
                            <Reply size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setMessageMenuId(
                                messageMenuId === message.id
                                  ? ""
                                  : message.id
                              )
                            }
                            aria-label="Další možnosti"
                          >
                            <MoreVertical size={14} />
                          </button>
                        </div>

                        {messageMenuId === message.id && (
                          <div className="chat-message-menu">
                            <div className="chat-reaction-row">
                              {EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() =>
                                    addReaction(
                                      message.id,
                                      emoji
                                    )
                                  }
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>

                            <button
                              type="button"
                              className="chat-menu-action"
                              onClick={() => {
                                setReplyTo(message);
                                setMessageMenuId("");
                              }}
                            >
                              <Reply size={15} />
                              Odpovědět
                            </button>

                            {(mine || isAdministrator) && (
                              <button
                                type="button"
                                className="chat-menu-action danger"
                                onClick={() =>
                                  deleteMessage(message)
                                }
                              >
                                <Trash2 size={15} />
                                Odstranit zprávu
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    </div>
                  );
                })
              ) : (
                <div className="chat-empty">
                  <ShieldCheck size={36} />
                  <h2>Začněte konverzaci</h2>
                  <p>
                    První zpráva bude před uložením
                    zašifrována přímo ve vašem zařízení.
                  </p>
                </div>
              )}

              {typingText && (
                <div className="chat-typing-bubble" aria-live="polite">
                  <span />
                  <span />
                  <span />
                  <small>{typingText}</small>
                </div>
              )}

              <div ref={messagesEndRef} />
            </section>

            <footer className="chat-composer-wrap">
              {replyTo && (
                <div className="chat-reply-bar">
                  <span>
                    Odpovídáte na zprávu z{" "}
                    {formatTime(replyTo.created_at)}
                  </span>

                  <button
                    type="button"
                    className="chat-icon-button"
                    onClick={() => setReplyTo(null)}
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              {recording ? (
                <div className="chat-recording">
                  <div>
                    <span className="chat-recording-dot" />
                    <strong>
                      Nahrávám… {recordingSeconds} s
                    </strong>
                  </div>

                  <div>
                    <button
                      type="button"
                      className="chat-icon-button"
                      onClick={cancelRecording}
                    >
                      <Trash2 size={16} />
                    </button>

                    <button
                      type="button"
                      className="chat-send-button"
                      onClick={stopRecording}
                    >
                      <Check size={17} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {recordedAudio && (
                    <div className="chat-recorded-preview">
                      <AudioMessage
                        src={URL.createObjectURL(
                          recordedAudio
                        )}
                      />

                      <button
                        type="button"
                        className="chat-icon-button"
                        onClick={() =>
                          setRecordedAudio(null)
                        }
                      >
                        <Trash2 size={16} />
                      </button>

                      <button
                        type="button"
                        className="chat-send-button"
                        disabled={sending}
                        onClick={() =>
                          sendMessage({
                            recordedBlob:
                              recordedAudio,
                          })
                        }
                      >
                        <Send size={17} />
                      </button>
                    </div>
                  )}

                  <div className="chat-composer">
                    <button
                      type="button"
                      className="chat-icon-button hide-mobile"
                      onClick={() =>
                        setEmojiOpen(
                          (current) => !current
                        )
                      }
                      disabled={!encryptionReady}
                    >
                      <Smile size={18} />
                    </button>

                    <button
                      type="button"
                      className="chat-icon-button"
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                      disabled={!encryptionReady}
                    >
                      <Paperclip size={18} />
                    </button>

                    <textarea
                      rows={1}
                      value={messageText}
                      placeholder={
                        encryptionReady
                          ? "Napište zprávu…"
                          : "Konverzace je uzamčena"
                      }
                      disabled={!encryptionReady || sending}
                      onChange={(event) =>
                        handleTypingChange(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.shiftKey
                        ) {
                          event.preventDefault();
                          sendMessage({
                            text: messageText,
                          });
                        }
                      }}
                    />

                    <button
                      type="button"
                      className="chat-icon-button hide-mobile"
                      onClick={() =>
                        cameraInputRef.current?.click()
                      }
                      disabled={!encryptionReady}
                    >
                      <Camera size={18} />
                    </button>

                    {messageText.trim() ? (
                      <button
                        type="button"
                        className="chat-send-button"
                        disabled={
                          sending || !encryptionReady
                        }
                        onClick={() =>
                          sendMessage({
                            text: messageText,
                          })
                        }
                      >
                        {sending ? (
                          <LoaderCircle size={17} />
                        ) : (
                          <Send size={17} />
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="chat-send-button"
                        disabled={!encryptionReady}
                        onClick={startRecording}
                      >
                        <Mic size={17} />
                      </button>
                    )}
                  </div>

                  {emojiOpen && (
                    <div className="chat-emoji-picker">
                      {EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            setMessageText(
                              (current) =>
                                `${current}${emoji}`
                            );
                            setEmojiOpen(false);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    multiple={false}
                    onChange={(event) => {
                      const file =
                        event.target.files?.[0];
                      if (file) {
                        sendMessage({ file });
                      }
                      event.target.value = "";
                    }}
                  />

                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={(event) => {
                      const file =
                        event.target.files?.[0];
                      if (file) {
                        sendMessage({ file });
                      }
                      event.target.value = "";
                    }}
                  />
                </>
              )}
            </footer>
          </>
        ) : (
          <div className="chat-empty">
            <MessageCircle size={42} />
            <h2>Vyberte konverzaci</h2>
            <p>
              V levé části vyberte existující chat nebo
              vytvořte nový soukromý či skupinový chat.
            </p>
          </div>
        )}
      </main>

      {newConversationOpen && (
        <div
          className="chat-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setNewConversationOpen(false);
            }
          }}
        >
          <form
            className="chat-modal"
            onSubmit={createConversation}
          >
            <header className="chat-modal-head">
              <div>
                <small>Nová konverzace</small>
                <h2>Vytvořit šifrovaný chat</h2>
              </div>

              <button
                type="button"
                className="chat-icon-button"
                onClick={() =>
                  setNewConversationOpen(false)
                }
              >
                <X size={17} />
              </button>
            </header>

            <div className="chat-modal-body">
              <div className="chat-encryption-banner">
                <LockKeyhole size={14} />
                Heslo konverzace se neukládá do Supabase.
                Bez něj nebude možné zprávy dešifrovat.
              </div>

              <div className="chat-field">
                <label>Typ konverzace</label>
                <select
                  value={newConversation.type}
                  onChange={(event) =>
                    setNewConversation((current) => ({
                      ...current,
                      type: event.target.value,
                      participantIds: [],
                    }))
                  }
                >
                  <option value="private">
                    Soukromý chat
                  </option>
                  <option value="group">
                    Skupinový chat
                  </option>
                  <option value="house">
                    Chat domu
                  </option>
                </select>
              </div>

              {newConversation.type !== "private" && (
                <div className="chat-field">
                  <label>Název konverzace</label>
                  <input
                    value={newConversation.title}
                    onChange={(event) =>
                      setNewConversation((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="např. Nájemníci domu"
                  />
                </div>
              )}

              <div className="chat-field">
                <label>Heslo šifrování</label>
                <input
                  type="password"
                  value={encryptionPassphrase}
                  onChange={(event) =>
                    setEncryptionPassphrase(
                      event.target.value
                    )
                  }
                  minLength={8}
                  placeholder="Alespoň 8 znaků"
                  autoComplete="new-password"
                />
              </div>

              <div className="chat-field">
                <label>Účastníci</label>

                <div className="chat-profile-picker">
                  {availableProfiles.map((profile) => {
                    const selected =
                      newConversation.participantIds.includes(
                        profile.id
                      );

                    const disabled =
                      newConversation.type === "private" &&
                      !selected &&
                      newConversation.participantIds.length >= 1;

                    return (
                      <label
                        key={profile.id}
                        className="chat-profile-option"
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={disabled}
                          onChange={() =>
                            setNewConversation(
                              (current) => ({
                                ...current,
                                participantIds: selected
                                  ? current.participantIds.filter(
                                      (id) =>
                                        id !== profile.id
                                    )
                                  : [
                                      ...current.participantIds,
                                      profile.id,
                                    ],
                              })
                            )
                          }
                        />

                        <span className="chat-avatar">
                          {profile.avatar_url ? (
                            <img
                              src={profile.avatar_url}
                              alt=""
                            />
                          ) : (
                            getInitials(
                              profile.full_name,
                              profile.username
                            )
                          )}
                        </span>

                        <span>
                          <strong>
                            {profile.full_name ||
                              profile.username}
                          </strong>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="chat-modal-actions">
                <button
                  type="button"
                  className="chat-button secondary"
                  onClick={() =>
                    setNewConversationOpen(false)
                  }
                >
                  Zrušit
                </button>

                <button
                  type="submit"
                  className="chat-button"
                  disabled={sending}
                >
                  {sending ? (
                    <LoaderCircle size={17} />
                  ) : (
                    <UserPlus size={17} />
                  )}
                  Vytvořit chat
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {encryptionDialogOpen && selectedConversation && (
        <div className="chat-modal-backdrop">
          <form
            className="chat-modal"
            onSubmit={unlockConversation}
          >
            <header className="chat-modal-head">
              <div>
                <small>Šifrovaná konverzace</small>
                <h2>Odemknout zprávy</h2>
              </div>
            </header>

            <div className="chat-modal-body">
              <div className="chat-encryption-banner warning">
                <LockKeyhole size={14} />
                Zadejte heslo, které bylo nastaveno při
                vytvoření konverzace.
              </div>

              <div className="chat-field">
                <label>Heslo konverzace</label>
                <input
                  type="password"
                  value={encryptionPassphrase}
                  onChange={(event) =>
                    setEncryptionPassphrase(
                      event.target.value
                    )
                  }
                  autoFocus
                />
              </div>

              <div className="chat-modal-actions">
                <button
                  type="submit"
                  className="chat-button"
                  disabled={!encryptionPassphrase}
                >
                  <LockKeyhole size={16} />
                  Odemknout chat
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}