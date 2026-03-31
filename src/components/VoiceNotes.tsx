import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Play, Pause, Trash2, Save, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

interface VoiceNote {
  id: string;
  contact_id?: string;
  work_order_id?: string;
  text: string;
  audio_url?: string;
  created_at: string;
  created_by_name?: string;
}

interface VoiceNotesProps {
  contactId?: string;
  workOrderId?: string;
  onNoteSaved?: (note: VoiceNote) => void;
}

// Speech Recognition API type
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function VoiceNotes({ contactId, workOrderId, onNoteSaved }: VoiceNotesProps) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [saving, setSaving] = useState(false);
  const [supported, setSupported] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
    }
    fetchNotes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, workOrderId]);

  const fetchNotes = async () => {
    if (!profile?.company_id) return;
    let query = supabase
      .from('voice_notes')
      .select('*')
      .order('created_at', { ascending: false });

    if (contactId) query = query.eq('contact_id', contactId);
    else if (workOrderId) query = query.eq('work_order_id', workOrderId);

    const { data } = await query;
    if (data) setNotes(data as VoiceNote[]);
  };

  const startRecording = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    setTranscript('');
    setInterimTranscript('');

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let final = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t + ' ';
        else interim += t;
      }
      setTranscript((prev) => prev + final);
      setInterimTranscript(interim);
    };

    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => {
      setIsRecording(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;
    recognition.start();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
    } catch {
      // Audio recording optional
    }

    setIsRecording(true);
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    }
    setIsRecording(false);
    setInterimTranscript('');
  };

  const saveNote = async () => {
    const finalText = (transcript + interimTranscript).trim();
    if (!finalText || !profile) return;
    setSaving(true);

    try {
      let audioUrl: string | undefined;
      if (audioChunksRef.current.length > 0) {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const fileName = `voice-notes/${profile.id}/${Date.now()}.webm`;
        const { data: uploadData } = await supabase.storage
          .from('documents')
          .upload(fileName, audioBlob);
        if (uploadData) {
          const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName);
          audioUrl = urlData.publicUrl;
        }
      }

      const { data, error } = await supabase
        .from('voice_notes')
        .insert({
          contact_id: contactId || null,
          work_order_id: workOrderId || null,
          company_id: profile.company_id,
          text: finalText,
          audio_url: audioUrl || null,
          created_by: profile.id,
          created_by_name: `${profile.first_name} ${profile.last_name}`.trim(),
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        const newNote = data as VoiceNote;
        setNotes((prev) => [newNote, ...prev]);
        onNoteSaved?.(newNote);
      }

      setTranscript('');
      audioChunksRef.current = [];
    } catch (err) {
      console.error('Voice note save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    await supabase.from('voice_notes').delete().eq('id', noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  if (!supported) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
        <MicOff className="w-4 h-4 inline mr-2" />
        Voice notes require a supported browser (Chrome or Safari on iOS 15+).
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Recorder */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
          <Mic className="w-4 h-4 text-accent" />
          Voice Notes
        </h3>

        {(transcript || interimTranscript) && (
          <div className="mb-3 bg-slate-50 rounded-xl p-3 min-h-[60px] text-sm text-slate-700">
            <span>{transcript}</span>
            <span className="text-slate-400">{interimTranscript}</span>
          </div>
        )}

        {isRecording && (
          <div className="flex items-center gap-2 mb-3">
            <div className="flex gap-0.5 items-end h-5">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-red-500 rounded-full animate-pulse"
                  style={{
                    height: `${40 + Math.sin(i * 1.2) * 30}%`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
            <span className="text-xs text-red-600 font-medium">Recording...</span>
          </div>
        )}

        <div className="flex gap-2">
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="flex-1 flex items-center justify-center gap-2 bg-accent text-white font-semibold py-3 rounded-xl active:scale-95 transition"
            >
              <Mic className="w-4 h-4" />
              Record Note
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white font-semibold py-3 rounded-xl active:scale-95 transition"
            >
              <MicOff className="w-4 h-4" />
              Stop
            </button>
          )}

          {(transcript || interimTranscript) && !isRecording && (
            <>
              <button
                onClick={saveNote}
                disabled={saving}
                className="flex items-center justify-center gap-2 bg-green-600 text-white font-semibold px-4 py-3 rounded-xl active:scale-95 transition disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              </button>
              <button
                onClick={() => { setTranscript(''); setInterimTranscript(''); }}
                className="flex items-center justify-center px-3 py-3 rounded-xl border border-slate-200 text-slate-500 active:scale-95 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Saved notes */}
      {notes.length > 0 && (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-slate-700 flex-1 leading-relaxed">{note.text}</p>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="flex-shrink-0 text-slate-300 hover:text-red-500 transition p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-slate-400">
                  {note.created_by_name} · {new Date(note.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                {note.audio_url && (
                  <button
                    onClick={() => {
                      const audio = new Audio(note.audio_url);
                      if (playingId === note.id) {
                        audio.pause();
                        setPlayingId(null);
                      } else {
                        audio.play();
                        setPlayingId(note.id);
                        audio.onended = () => setPlayingId(null);
                      }
                    }}
                    className={cn(
                      'flex items-center gap-1 text-xs px-2 py-1 rounded-lg',
                      playingId === note.id
                        ? 'bg-accent text-white'
                        : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {playingId === note.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    Audio
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
