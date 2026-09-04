import { useEffect, useState, useRef, type ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { QuizData, Question } from '../types';
import { loadQuizData, getTopicStats, saveQuizResults, saveSessionData, clearSessionData, loadAllStats, saveImageBlob, saveImageReassignment, loadImageReassignments, getImageBlob, loadCorrections, saveCorrection, savePracticeResults } from '../data/quizStore';

interface QuizPageProps {
  practice?: boolean;
}

export default function QuizPage({ practice }: QuizPageProps) {
  const { topicKey } = useParams();
  const navigate = useNavigate();

  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [isFinished, setIsFinished] = useState(false);
  const isFinishedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [customImages, setCustomImages] = useState<Record<string, string>>({});
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [customCorrections, setCustomCorrections] = useState<Record<string, {
    customQuestionText?: string;
    customOptions?: string[];
    newCorrectIndex?: number;
    note?: string;
    timestamp?: number;
  }>>({});

  // Local edit state
  const [editingText, setEditingText] = useState('');
  const [editingOptions, setEditingOptions] = useState<string[]>([]);
  const [editingCorrectIndex, setEditingCorrectIndex] = useState(0);

  const [isCorrecting, setIsCorrecting] = useState(false);
  const [correctionCorrectIndex, setCorrectionCorrectIndex] = useState(0);
  const [correctionNote, setCorrectionNote] = useState('');

  // Load data
  useEffect(() => {
    (async () => {
      try {
        const data = await loadQuizData();
        setQuizData(data);

        const reassignments = await loadImageReassignments();
        const loadedCustomImages: Record<string, string> = {};

        for (const qId in reassignments) {
          const re = reassignments[qId];
          if (re.imageBlobId) {
            const blobUrl = await getImageBlob(re.imageBlobId);
            if (blobUrl) loadedCustomImages[qId] = blobUrl;
          }
        }
        setCustomImages(loadedCustomImages);

        const loadedCorrections = await loadCorrections();
        setCustomCorrections(loadedCorrections);

        if (practice) {
          const stats = await loadAllStats();

          // Check if there is an existing practice session
          const practiceStats = stats['practice_session'];
          if (practiceStats && practiceStats.sessionData && practiceStats.sessionData.practiceQuestionIds) {
            const savedQIds = practiceStats.sessionData.practiceQuestionIds;
            const practiceQ: Question[] = [];
            Object.values(data.topics).forEach(topic => {
              topic.questions.forEach(q => {
                if (savedQIds.includes(q.id)) {
                  practiceQ.push(q);
                }
              });
            });
            // Reorder to match saved
            practiceQ.sort((a, b) => savedQIds.indexOf(a.id) - savedQIds.indexOf(b.id));
            setQuestions(practiceQ);
            setUserAnswers(practiceStats.sessionData.userAnswers);
            setCurrentIdx(practiceStats.sessionData.currentQuestionIndex);
          } else {
            // New practice session: collect mistakes from only the FIRST (latest) run of each topic history
            // to avoid showing correct questions from old runs.
            const uniqueMistakes = new Set<string>();
            Object.values(stats).forEach(ts => {
              if (ts.mistakeHistory && ts.mistakeHistory.length > 0) {
                ts.mistakeHistory[0].forEach(q => uniqueMistakes.add(q));
              }
            });

            const practiceQ: Question[] = [];
            Object.values(data.topics).forEach(topic => {
              topic.questions.forEach(q => {
                if (uniqueMistakes.has(q.id) || uniqueMistakes.has(q.question)) {
                  practiceQ.push(q);
                  uniqueMistakes.delete(q.id);
                  uniqueMistakes.delete(q.question);
                }
              });
            });
            // Shuffle
            for (let i = practiceQ.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [practiceQ[i], practiceQ[j]] = [practiceQ[j], practiceQ[i]];
            }
            setQuestions(practiceQ);
          }
        } else if (topicKey && data.topics[topicKey]) {
          setQuestions(data.topics[topicKey].questions);
          // Restore session if exists
          const stats = await getTopicStats(topicKey);
          if (stats.sessionData) {
            setUserAnswers(stats.sessionData.userAnswers);
            setCurrentIdx(stats.sessionData.currentQuestionIndex);
          }
        }
      } catch (e) {
        console.error('Failed to load quiz data', e);
      }
      setLoading(false);
    })();
  }, [topicKey, practice]);

  useEffect(() => {
    isFinishedRef.current = isFinished;
  }, [isFinished]);

  // Save session before unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!isFinishedRef.current && questions.length > 0) {
        const keyToSave = practice ? 'practice_session' : (topicKey || '');
        if (keyToSave) {
          saveSessionData(keyToSave, {
            userAnswers,
            currentQuestionIndex: currentIdx,
            ...(practice ? { practiceQuestionIds: questions.map(q => q.id) } : {})
          });
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (!isFinishedRef.current && questions.length > 0) {
        const keyToSave = practice ? 'practice_session' : (topicKey || '');
        if (keyToSave) {
          saveSessionData(keyToSave, {
            userAnswers,
            currentQuestionIndex: currentIdx,
            ...(practice ? { practiceQuestionIds: questions.map(q => q.id) } : {})
          });
        }
      }
    };
  }, [topicKey, practice, questions, userAnswers, currentIdx]);

  const handleAnswer = (optionIdx: number) => {
    if (userAnswers[currentIdx] !== undefined) return;
    const newAnswers = { ...userAnswers, [currentIdx]: optionIdx };
    setUserAnswers(newAnswers);
    // Autosave session instantly
    if (!isFinished && questions.length > 0) {
      const keyToSave = practice ? 'practice_session' : (topicKey || '');
      if (keyToSave) {
        saveSessionData(keyToSave, {
          userAnswers: newAnswers,
          currentQuestionIndex: currentIdx,
          ...(practice ? { practiceQuestionIds: questions.map(q => q.id) } : {})
        });
      }
    }
  };

  const handleNext = () => {
    setIsCorrecting(false);
    if (currentIdx < questions.length - 1) {
      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      // Autosave session instantly
      if (!isFinished && questions.length > 0) {
        const keyToSave = practice ? 'practice_session' : (topicKey || '');
        if (keyToSave) {
          saveSessionData(keyToSave, {
            userAnswers,
            currentQuestionIndex: nextIdx,
            ...(practice ? { practiceQuestionIds: questions.map(q => q.id) } : {})
          });
        }
      }
    } else {
      finishQuiz();
    }
  };

  const handleBack = () => {
    setIsCorrecting(false);
    if (currentIdx > 0) {
      const prevIdx = currentIdx - 1;
      setCurrentIdx(prevIdx);
      // Autosave session instantly
      if (!isFinished && questions.length > 0) {
        const keyToSave = practice ? 'practice_session' : (topicKey || '');
        if (keyToSave) {
          saveSessionData(keyToSave, {
            userAnswers,
            currentQuestionIndex: prevIdx,
            ...(practice ? { practiceQuestionIds: questions.map(q => q.id) } : {})
          });
        }
      }
    }
  };

  const finishQuiz = async () => {
    isFinishedRef.current = true;
    setIsFinished(true);

    let correctCount = 0;
    const mistakes: string[] = [];
    const correct: string[] = [];

    questions.forEach((q, idx) => {
      const correction = customCorrections[q.id];
      const actualCorrectIndex = correction?.newCorrectIndex ?? q.correct_index;

      // We must track mistakes/correct by their original question text
      // because the global stats rely on the original text to map back to topics
      const trackingQuestion = q.question;

      const ans = userAnswers[idx];
      if (ans === actualCorrectIndex) {
        correctCount++;
        correct.push(trackingQuestion);
      } else {
        mistakes.push(trackingQuestion);
      }
    });

    const score = (correctCount / questions.length) * 100;

    if (practice) {
      await savePracticeResults(mistakes, correct);
      await clearSessionData('practice_session');
    } else if (topicKey) {
      await saveQuizResults(topicKey, score, mistakes, correct);
      await clearSessionData(topicKey);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!quizData || questions.length === 0) return <div>No questions found.</div>;

  if (isFinished) {
    let correctCount = 0;
    questions.forEach((q, idx) => {
      const correction = customCorrections[q.id];
      const actualCorrectIndex = correction?.newCorrectIndex ?? q.correct_index;
      if (userAnswers[idx] === actualCorrectIndex) correctCount++;
    });

    return (
      <div className="page" style={{ textAlign: 'center', padding: '80px 0' }}>
        <h2>Тест Завершен!</h2>
        <p>Вы завершили тест.</p>
        <p>
          Ваш результат: {correctCount} из {questions.length}
        </p>
        <p>Процент: {((correctCount / questions.length) * 100).toFixed(1)}%</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          Вернуться на главную
        </button>
      </div>
    );
  }

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>, qId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const blobId = await saveImageBlob(qId, file);

      await saveImageReassignment(qId, {
        questionId: qId,
        imageBlobId: blobId,
        timestamp: Date.now()
      });

      const newUrl = await getImageBlob(blobId);
      if (newUrl) {
        setCustomImages(prev => ({ ...prev, [qId]: newUrl }));
        setImageErrors(prev => ({ ...prev, [qId]: false }));
        alert('Изображение успешно обновлено для этого вопроса!');
      }
    } catch {
      alert('Не удалось сохранить изображение.');
    }
  };

  const q = questions[currentIdx];
  const correction = q ? customCorrections[q.id] : null;
  const displayQ = q ? {
    ...q,
    question: correction?.customQuestionText || q.question,
    options: correction?.customOptions || q.options,
    correct_index: correction?.newCorrectIndex ?? q.correct_index,
  } : null;

  const hasAnswered = userAnswers[currentIdx] !== undefined;
  const displayImageUrl = q ? (customImages[q.id] || (q.image ? `/images/${q.image}` : undefined)) : undefined;

  const handleSaveCorrection = async () => {
    if (q) {
      const newCorrection = {
        ...(customCorrections[q.id] || {}),
        newCorrectIndex: correctionCorrectIndex,
        note: correctionNote,
        timestamp: Date.now()
      };
      await saveCorrection(q.id, newCorrection);
      setCustomCorrections(prev => ({ ...prev, [q.id]: newCorrection }));
      setIsCorrecting(false);
    }
  };

  const toggleEditingMode = async () => {
    if (isEditingMode && q) {
      // Save changes
      const newCorrection = {
        ...(customCorrections[q.id] || {}),
        customQuestionText: editingText,
        customOptions: editingOptions,
        newCorrectIndex: editingCorrectIndex,
        timestamp: Date.now()
      };
      await saveCorrection(q.id, newCorrection);
      setCustomCorrections(prev => ({ ...prev, [q.id]: newCorrection }));
      setIsEditingMode(false);
    } else if (q && displayQ) {
      // Enter edit mode
      setEditingText(displayQ.question);
      setEditingOptions([...displayQ.options]);
      setEditingCorrectIndex(displayQ.correct_index);
      setIsEditingMode(true);
    }
  };

  const handleOptionEdit = (index: number, value: string) => {
    const newOptions = [...editingOptions];
    newOptions[index] = value;
    setEditingOptions(newOptions);
  };

  const handleAddOption = () => {
    setEditingOptions([...editingOptions, 'New Option']);
  };

  const handleRemoveOption = (index: number) => {
    if (editingOptions.length <= 2) {
      alert('Questions must have at least 2 options.');
      return;
    }
    const newOptions = editingOptions.filter((_, i) => i !== index);
    setEditingOptions(newOptions);
    if (editingCorrectIndex >= index && editingCorrectIndex > 0) {
      setEditingCorrectIndex(editingCorrectIndex - 1);
    }
  };

  if (!displayQ) return <div>No questions found.</div>;

  return (
    <div className="page">
      <div className="card" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Вопрос {currentIdx + 1} из {questions.length}</h3>
          <button
            className={`btn btn-sm ${isEditingMode ? 'btn-primary' : 'btn-secondary'}`}
            onClick={toggleEditingMode}
          >
            {isEditingMode ? 'Save & Done' : 'Edit Question'}
          </button>
        </div>

        {displayImageUrl && !imageErrors[q.id] && (
          <div className="question-image-wrapper">
            <img
              src={displayImageUrl}
              alt="Иллюстрация к вопросу"
              className="question-image"
              onClick={() => setLightboxUrl(displayImageUrl)}
              onError={() => setImageErrors(prev => ({ ...prev, [q.id]: true }))}
            />
            <div className="image-zoom-hint">🔍 Увеличить</div>
            {isEditingMode && (
              <label className="btn btn-primary btn-sm" style={{ position: 'absolute', bottom: '10px', right: '10px', cursor: 'pointer' }}>
                Change Image
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, q.id)} />
              </label>
            )}
          </div>
        )}

        {displayImageUrl && imageErrors[q.id] && (
          <div className="image-fallback-card">
            <div className="image-fallback-badge">⚠️ Изображение недоступно</div>
            <p style={{ margin: '8px 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Файл изображения не найден в базе вопросов:
            </p>
            <div className="image-fallback-filename">{q.image}</div>
            <div style={{ marginTop: '12px' }}>
              <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
                📷 Загрузить изображение
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, q.id)} />
              </label>
            </div>
          </div>
        )}

        {!displayImageUrl && isEditingMode && (
           <div className="question-image-container" style={{ border: '2px dashed #ccc', padding: '2rem', textAlign: 'center', marginBottom: '1rem' }}>
             <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
                Upload Image
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, q.id)} />
              </label>
           </div>
        )}
        {isEditingMode ? (
          <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontWeight: 'bold' }}>Question Text:</label>
            <textarea
              className="input"
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              rows={3}
            />
          </div>
        ) : (
          <p style={{ fontSize: '1.2rem', marginBottom: '20px' }}>{displayQ.question}</p>
        )}

        <div className="option-list">
          {(isEditingMode ? editingOptions : displayQ.options).map((opt: string, idx: number) => {
            if (isEditingMode) {
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <input
                    type="radio"
                    name="correct_answer"
                    checked={editingCorrectIndex === idx}
                    onChange={() => setEditingCorrectIndex(idx)}
                  />
                  <input
                    type="text"
                    className="input"
                    value={opt}
                    onChange={(e) => handleOptionEdit(idx, e.target.value)}
                    style={{ flex: 1, margin: 0 }}
                  />
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleRemoveOption(idx)}
                    style={{ padding: '0.2rem 0.5rem', margin: 0 }}
                  >
                    X
                  </button>
                </div>
              );
            }

            let className = 'option-item';
            if (hasAnswered) {
              if (idx === displayQ.correct_index) className += ' option-correct';
              else if (idx === userAnswers[currentIdx]) className += ' option-wrong';
              className += ' option-disabled';
            } else if (userAnswers[currentIdx] === idx) {
              className += ' option-selected';
            }

            return (
              <div
                key={idx}
                className={className}
                onClick={() => !hasAnswered && handleAnswer(idx)}
              >
                <div className="option-radio"></div>
                {opt}
              </div>
            );
          })}
        </div>

        {isEditingMode && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleAddOption}
            style={{ marginTop: '10px' }}
          >
            + Add Option
          </button>
        )}

        {hasAnswered && !isEditingMode && (
          <>
            <div className="explanation-box">
              <div style={{ marginBottom: '10px' }}>
                <strong>Оригинальный ответ в базе:</strong> Вариант {q.correct_index + 1}
              </div>
              <strong>Объяснение:</strong> {displayQ.explanation}
              {correction?.note && (
                <div style={{ marginTop: '10px', color: 'var(--primary)' }}>
                  <strong>Ваша заметка:</strong> {correction.note}
                </div>
              )}
            </div>
            {!isCorrecting ? (
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: '10px' }}
                onClick={() => {
                  setIsCorrecting(true);
                  setCorrectionCorrectIndex(displayQ.correct_index);
                  setCorrectionNote(correction?.note || '');
                }}
              >
                ✏️ Fix Answer
              </button>
            ) : (
              <div className="card" style={{ marginTop: '10px', border: '1px solid var(--primary)' }}>
                <h4>Исправить ответ</h4>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontWeight: 'bold' }}>Правильный ответ:</label>
                  <select
                    className="input"
                    value={correctionCorrectIndex}
                    onChange={(e) => setCorrectionCorrectIndex(Number(e.target.value))}
                    style={{ marginTop: '5px' }}
                  >
                    {displayQ.options.map((opt: string, idx: number) => (
                      <option key={idx} value={idx}>{idx + 1}. {opt}</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontWeight: 'bold' }}>Заметка/Объяснение:</label>
                  <textarea
                    className="input"
                    value={correctionNote}
                    onChange={(e) => setCorrectionNote(e.target.value)}
                    rows={3}
                    style={{ marginTop: '5px' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveCorrection}>
                    Сохранить
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setIsCorrecting(false)}>
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="quiz-bottom-bar" style={{ marginTop: '20px' }}>
          <div className="quiz-nav-buttons">
            <button className="btn btn-secondary" onClick={handleBack} disabled={currentIdx === 0}>
              &lt; Назад
            </button>
            <button
              className="btn btn-primary"
              onClick={handleNext}
              disabled={!hasAnswered}
            >
              {currentIdx === questions.length - 1 ? 'Завершить' : 'Следующий >'}
            </button>
          </div>
        </div>
      </div>

      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <button className="lightbox-close" onClick={() => setLightboxUrl(null)}>✕</button>
          <img
            src={lightboxUrl}
            alt="Увеличенное изображение"
            className="lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
