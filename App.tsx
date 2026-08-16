import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import supabase from './src/lib/supabase';
import { askExpoMind } from './src/lib/ragService';

// Quick prompt suggestions
const QUICK_PROMPTS = [
  { id: '1', label: 'Create Project 🚀', query: 'How do I create a new Expo project?' },
  { id: '2', label: 'Environment Setup ⚙️', query: 'How to set up development environment for Expo?' },
  { id: '3', label: 'EAS Build 📦', query: 'How to build project with EAS Build?' },
  { id: '4', label: 'EAS Update ⚡', query: 'How to publish updates using EAS Update?' },
];

export default function App() {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string>('');
  const [source, setSource] = useState<{ title?: string; url?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const runPrompt = async (promptQuery?: string) => {
    const targetQuery = promptQuery || query;
    if (!targetQuery.trim()) return;
    
    if (promptQuery) {
      setQuery(promptQuery);
    }
    
    setLoading(true);
    setResponse('');
    setSource(null);

    try {
      const res = await askExpoMind(targetQuery);
      if (res?.answer) {
        setResponse(res.answer);
        setSource(res.source || null);
      } else {
        setResponse('No response generated.');
      }
    } catch (err: any) {
      console.log('RAG SERVICE ERROR:', err);
      setResponse(`Error: ${err.message || 'Failed to generate response'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResponse('');
    setSource(null);
  };

  // Helper to format text output nicely with code blocks
  const renderFormattedResponse = (text: string) => {
    if (!text) return null;

    const parts = text.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const firstLineEnd = part.indexOf('\n');
        const language = firstLineEnd > 3 ? part.substring(3, firstLineEnd).trim() : 'code';
        const codeContent = firstLineEnd !== -1 
          ? part.substring(firstLineEnd + 1, part.length - 3) 
          : part.substring(3, part.length - 3);

        return (
          <View key={index} style={styles.codeContainer}>
            <View style={styles.codeHeader}>
              <Text style={styles.codeLangText}>{language.toUpperCase()}</Text>
              <MaterialCommunityIcons name="content-copy" size={16} color="#A0AEC0" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={styles.codeText}>{codeContent.trim()}</Text>
            </ScrollView>
          </View>
        );
      }

      // Regular text block formatting
      const lines = part.split('\n');
      return (
        <View key={index} style={styles.textSection}>
          {lines.map((line, lIdx) => {
            if (!line.trim()) return <View key={lIdx} style={{ height: 6 }} />;

            if (line.startsWith('### ')) {
              return (
                <Text key={lIdx} style={styles.h3Text}>
                  {line.replace('### ', '')}
                </Text>
              );
            }
            if (line.startsWith('## ')) {
              return (
                <Text key={lIdx} style={styles.h2Text}>
                  {line.replace('## ', '')}
                </Text>
              );
            }
            if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
              return (
                <View key={lIdx} style={styles.bulletRow}>
                  <Text style={styles.bulletPoint}>•</Text>
                  <Text style={styles.bulletText}>{line.trim().substring(2)}</Text>
                </View>
              );
            }

            return (
              <Text key={lIdx} style={styles.paragraphText}>
                {line}
              </Text>
            );
          })}
        </View>
      );
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        {/* Cute Navigation / Header Bar */}
        <View style={styles.headerBar}>
          <View style={styles.brandRow}>
            <View style={styles.avatarCircle}>
              <MaterialCommunityIcons name="robot-happy-outline" size={26} color="#6C5CE7" />
            </View>
            <View>
              <View style={styles.titleRow}>
                <Text style={styles.headerTitle}>ExpoMind</Text>
                <View style={styles.aiBadge}>
                  <Text style={styles.aiBadgeText}>AI v57</Text>
                </View>
              </View>
              <Text style={styles.headerSubtitle}>Your Smart Expo Documentation Companion ✨</Text>
            </View>
          </View>
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClear} style={styles.clearHeaderBtn}>
              <Ionicons name="refresh" size={18} color="#718096" />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Quick Suggestion Chips */}
          <Text style={styles.sectionLabel}>Popular Topics 💡</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScrollView}
            contentContainerStyle={styles.chipContainer}
          >
            {QUICK_PROMPTS.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.chipButton}
                activeOpacity={0.7}
                onPress={() => runPrompt(item.query)}
              >
                <Text style={styles.chipText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Interactive Search Input Box */}
          <View style={styles.inputCard}>
            <View style={styles.inputInnerRow}>
              <Ionicons name="search-outline" size={20} color="#909399" style={styles.searchIcon} />
              <TextInput
                placeholder="Ask anything about Expo SDK 57..."
                placeholderTextColor="#A0AEC0"
                value={query}
                onChangeText={setQuery}
                style={styles.input}
                multiline
                maxLength={200}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} style={styles.inlineClear}>
                  <Ionicons name="close-circle" size={18} color="#CBD5E0" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.sendButton,
                (!query.trim() || loading) && styles.sendButtonDisabled,
              ]}
              onPress={() => runPrompt()}
              disabled={!query.trim() || loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.sendButtonText}>Ask ExpoMind</Text>
                  <Ionicons name="sparkles" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Loading Animation Card */}
          {loading && (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color="#6C5CE7" />
              <Text style={styles.loadingTitle}>Searching Expo Documentation...</Text>
              <Text style={styles.loadingSubtitle}>Generating vector embeddings & retrieving answer</Text>
            </View>
          )}

          {/* Response Container */}
          {response ? (
            <View style={styles.responseCard}>
              <View style={styles.responseHeader}>
                <View style={styles.responseBadge}>
                  <Ionicons name="sparkles" size={16} color="#6C5CE7" />
                  <Text style={styles.responseBadgeText}>ExpoMind Answer</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setResponse('')}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={18} color="#A0AEC0" />
                </TouchableOpacity>
              </View>

              <View style={styles.responseBody}>
                {renderFormattedResponse(response)}
              </View>

              {/* Source Document Citation Card */}
              {source?.title && (
                <TouchableOpacity
                  style={styles.sourceCard}
                  activeOpacity={0.7}
                  onPress={() => source.url && Linking.openURL(source.url)}
                >
                  <View style={styles.sourceLeft}>
                    <Ionicons name="document-text-outline" size={20} color="#6C5CE7" />
                    <View style={styles.sourceTextGroup}>
                      <Text style={styles.sourceTag}>VERIFIED EXPO DOC</Text>
                      <Text style={styles.sourceTitle}>{source.title}</Text>
                    </View>
                  </View>
                  <Ionicons name="open-outline" size={16} color="#A0AEC0" />
                </TouchableOpacity>
              )}
            </View>
          ) : !loading ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBg}>
                <MaterialCommunityIcons name="lightbulb-on-outline" size={32} color="#8C7AE6" />
              </View>
              <Text style={styles.emptyTitle}>Ask Me Anything!</Text>
              <Text style={styles.emptySubtitle}>
                Get instant answers powered by vector similarity search and Gemini AI on Expo SDK 57 docs.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 12,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0EDFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A202C',
    letterSpacing: -0.3,
  },
  aiBadge: {
    backgroundColor: '#6C5CE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  aiBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
  },
  clearHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F7FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#718096',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipScrollView: {
    marginBottom: 18,
  },
  chipContainer: {
    paddingRight: 10,
  },
  chipButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#A0AEC0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A5568',
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  inputInnerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 50,
  },
  searchIcon: {
    marginRight: 10,
    marginTop: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#2D3748',
    paddingTop: 8,
    paddingBottom: 8,
    maxHeight: 100,
  },
  inlineClear: {
    padding: 6,
  },
  sendButton: {
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#CBD5E0',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 10,
  },
  loadingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D3748',
    marginTop: 14,
  },
  loadingSubtitle: {
    fontSize: 12,
    color: '#A0AEC0',
    marginTop: 4,
  },
  responseCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  responseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
    marginBottom: 14,
  },
  responseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0EDFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  responseBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6C5CE7',
    marginLeft: 6,
  },
  responseBody: {
    marginBottom: 10,
  },
  textSection: {
    marginBottom: 8,
  },
  h2Text: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A202C',
    marginTop: 12,
    marginBottom: 6,
  },
  h3Text: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D3748',
    marginTop: 10,
    marginBottom: 4,
  },
  paragraphText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#4A5568',
    marginBottom: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    paddingLeft: 4,
  },
  bulletPoint: {
    fontSize: 16,
    color: '#6C5CE7',
    marginRight: 8,
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: '#4A5568',
  },
  codeContainer: {
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    marginVertical: 10,
    overflow: 'hidden',
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2A2A3C',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  codeLangText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A0AEC0',
    letterSpacing: 0.5,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: '#F8F8F2',
    padding: 14,
    lineHeight: 19,
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F7FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 10,
  },
  sourceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sourceTextGroup: {
    marginLeft: 10,
    flex: 1,
  },
  sourceTag: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6C5CE7',
    letterSpacing: 0.5,
  },
  sourceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2D3748',
    marginTop: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F0EDFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#718096',
    textAlign: 'center',
    lineHeight: 19,
  },
});

