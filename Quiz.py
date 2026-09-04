import customtkinter as ctk
from PIL import Image
import os
import sys
import importlib.util
from tkinter import messagebox
import textwrap
import json  
import random 

# --- Configuration ---
QUIZ_DATA_DIR = r'D:\DSM\quiz_data_modules'
IMAGE_DIR = r'D:\DSM\new folder'
STATS_FILE = r"D:\DSM\quiz_data_modules\quiz_stats.json" 
MISTAKE_HISTORY_LIMIT = 3 
# ---------------------

ctk.set_appearance_mode("System")
ctk.set_default_color_theme("blue")

class QuizApp(ctk.CTkToplevel):
    def __init__(self, parent, quiz_data, theme_key, 
                 finish_save_callback, # Функция для сохранения РЕЗУЛЬТАТА
                 session_save_callback,  # Функция для сохранения СЕССИИ
                 session_clear_callback, # Функция для ОЧИСТКИ СЕССИИ
                 initial_session=None):   # Данные прошлой сессии
        super().__init__(parent)
        
        self.title(f"Тест - {theme_key}")
        self.geometry("900x700")
        self.parent = parent
        
        self.grab_set()
        self.protocol("WM_DELETE_WINDOW", self.on_close)

        # --- Переменные состояния ---
        self.questions = quiz_data
        self.total_questions = len(self.questions)
        self.radio_buttons = []
        self.is_finished = False 
        
        self.theme_key = theme_key 
        self.finish_save_callback = finish_save_callback
        self.session_save_callback = session_save_callback
        self.session_clear_callback = session_clear_callback
        
        self.selected_option = ctk.IntVar(value=-1)
        
        # --- ЛОГИКА ЗАГРУЗКИ СЕССИИ ---
        if initial_session:
            self.user_answers = initial_session.get('user_answers', {})
            self.current_question_index = initial_session.get('current_question_index', 0)
            self.recalculate_score()
        else:
            self.user_answers = {} 
            self.current_question_index = 0
            self.correct_answers = 0
        # -----------------------------

        # --- Layout ---
        self.grid_rowconfigure(0, weight=1) 
        self.grid_rowconfigure(1, weight=1) 
        self.grid_rowconfigure(2, weight=0) 
        self.grid_columnconfigure(0, weight=1)

        # 1. Top Frame
        self.top_frame = ctk.CTkFrame(self)
        self.top_frame.grid(row=0, column=0, padx=20, pady=20, sticky="nsew")
        self.top_frame.grid_columnconfigure(0, weight=1, minsize=400) 
        self.top_frame.grid_columnconfigure(1, weight=1) 
        self.top_frame.grid_rowconfigure(0, weight=1)

        self.image_label = ctk.CTkLabel(self.top_frame, text="", height=250)
        self.image_label.grid(row=0, column=0, padx=10, pady=10, sticky="nsew")
        
        light_pil_img = Image.new("RGB", (400, 250), color="#CCCCCC") 
        dark_pil_img = Image.new("RGB", (400, 250), color="#333333")
        
        self.default_image = ctk.CTkImage(light_image=light_pil_img,
                                          dark_image=dark_pil_img,
                                          size=(400, 250))

        self.question_label = ctk.CTkLabel(self.top_frame, text="...", wraplength=400, font=ctk.CTkFont(size=16), anchor="w", justify="left")
        self.question_label.grid(row=0, column=1, padx=20, pady=20, sticky="nsew")

        # 2. Middle Frame (Options)
        self.options_frame = ctk.CTkFrame(self)
        self.options_frame.grid(row=1, column=0, padx=20, pady=10, sticky="nsew")
        self.options_frame.grid_columnconfigure(0, weight=1)

        # 3. Bottom Frame (Buttons & Stats)
        self.bottom_frame = ctk.CTkFrame(self)
        self.bottom_frame.grid(row=2, column=0, padx=20, pady=20, sticky="nsew")
        self.bottom_frame.grid_columnconfigure(0, weight=1) # Stats
        self.bottom_frame.grid_columnconfigure(1, weight=1) # Buttons
        
        self.stats_label = ctk.CTkLabel(self.bottom_frame, text="...", font=ctk.CTkFont(size=14))
        self.stats_label.grid(row=0, column=0, padx=20, pady=10, sticky="w")

        self.button_frame = ctk.CTkFrame(self.bottom_frame, fg_color="transparent")
        self.button_frame.grid(row=0, column=1, padx=20, pady=10, sticky="e")
        
        # --- Кнопки ---
        self.back_button = ctk.CTkButton(self.button_frame, text="< Назад", command=self.previous_question, font=ctk.CTkFont(size=14))
        self.back_button.pack(side="left", padx=5)
        
        self.details_button = ctk.CTkButton(self.button_frame, text="Показать детали", command=self.show_details, font=ctk.CTkFont(size=14))
        
        self.check_button = ctk.CTkButton(self.button_frame, text="Ответить", command=self.check_answer, font=ctk.CTkFont(size=14))
        self.check_button.pack(side="left", padx=5)

        self.next_button = ctk.CTkButton(self.button_frame, text="Следующий >", command=self.next_question, font=ctk.CTkFont(size=14))
        # ------------------------

        if self.total_questions == 0:
            self.question_label.configure(text="Ошибка: В этом модуле нет вопросов.")
        else:
            self.load_question()

    def on_close(self):
        """
        Перехватывает закрытие окна, чтобы спросить о сохранении сессии.
        """
        if self.is_finished:
            self.parent.quiz_window = None 
            self.destroy()
            return
            
        if self.session_save_callback is None or self.session_clear_callback is None:
            self.parent.quiz_window = None 
            self.destroy()
            return

        msg = messagebox.askyesnocancel("Сохранить?", 
                                        "Хотите сохранить свой прогресс и выйти?", 
                                        parent=self)
        
        if msg is True: # "Да" (Сохранить)
            session_data = {
                'user_answers': self.user_answers,
                'current_question_index': self.current_question_index
            }
            self.session_save_callback(self.theme_key, session_data)
            self.parent.quiz_window = None 
            self.destroy()
            
        elif msg is False: # "Нет" (Не сохранять)
            self.session_clear_callback(self.theme_key) 
            self.parent.quiz_window = None 
            self.destroy()
            
        elif msg is None: # "Отмена"
            return 

    def load_question(self):
        """Загружает вопрос, опции и восстанавливает предыдущий ответ, если он есть."""
        for rb in self.radio_buttons:
            rb.destroy()
        self.radio_buttons.clear()
        
        self.details_button.pack_forget() 
        self.next_button.pack_forget()
        self.check_button.pack(side="left", padx=5)
        self.check_button.configure(state="normal")
        
        self.back_button.configure(state="normal" if self.current_question_index > 0 else "disabled")

        q = self.questions[self.current_question_index]
        self.question_label.configure(text=q["question"])

        image_path = os.path.join(IMAGE_DIR, q["image"] if q["image"] else "")
        if q["image"] and os.path.exists(image_path):
            try:
                img = ctk.CTkImage(Image.open(image_path), size=(400, 250))
                self.image_label.configure(image=img, text="")
            except Exception as e:
                self.image_label.configure(image=self.default_image, text=f"Image not found:\n{q['image']}")
        else:
            self.image_label.configure(image=self.default_image, text="")

        for i, option in enumerate(q["options"]):
            wrapped_text = textwrap.fill(option, width=110)
            
            rb = ctk.CTkRadioButton(self.options_frame, 
                                    text=wrapped_text, 
                                    variable=self.selected_option, 
                                    value=i, 
                                    font=ctk.CTkFont(size=14)
                                    )
            rb.grid(row=i, column=0, padx=20, pady=10, sticky="w")
            self.radio_buttons.append(rb)
        
        if self.current_question_index in self.user_answers:
            prev_answer = self.user_answers[self.current_question_index]
            self.selected_option.set(prev_answer)
            self.show_answered_state(preview=True)
            self.check_button.pack_forget()
            self.details_button.pack(side="left", padx=5)
            self.next_button.pack(side="left", padx=5)
        else:
            self.selected_option.set(-1) 
        
        self.update_stats()

    def check_answer(self):
        """Вызывается кнопкой 'Ответить'."""
        
        selected_idx = self.selected_option.get()
        if selected_idx == -1: 
            messagebox.showwarning("Не выбран ответ", "Пожалуйста, выберите один из вариантов.", parent=self)
            return

        self.user_answers[self.current_question_index] = selected_idx
        
        self.recalculate_score()
        self.update_stats()
        
        self.show_answered_state(preview=False)
        
        self.check_button.pack_forget()
        self.details_button.pack(side="left", padx=5)
        self.next_button.pack(side="left", padx=5)

    def show_answered_state(self, preview=False):
        """Показывает правильный/неправильный ответ."""
        q = self.questions[self.current_question_index]
        correct_idx = q["correct_index"]
        selected_idx = self.selected_option.get()

        for i, rb in enumerate(self.radio_buttons):
            rb.configure(text_color=("gray10", "gray90"))
            
            if not preview: 
                rb.configure(state="disabled")
            else:
                rb.configure(state="normal")

            if i == correct_idx:
                rb.configure(text_color="green")
            if i == selected_idx and i != correct_idx:
                rb.configure(text_color="red")
                
    def recalculate_score(self):
        """Пересчитывает общее кол-во правильных ответов по словарю user_answers."""
        correct = 0
        for q_index, user_answer_index in self.user_answers.items():
            if q_index < len(self.questions) and \
               user_answer_index == self.questions[q_index]["correct_index"]:
                correct += 1
        self.correct_answers = correct
        
    def previous_question(self):
        """Переходит к предыдущему вопросу."""
        if self.current_question_index > 0:
            self.current_question_index -= 1
            self.load_question()

    def next_question(self):
        """Переходит к следующему вопросу или завершает тест."""
        if self.current_question_index < self.total_questions - 1:
            self.current_question_index += 1
            self.load_question()
        else:
            self.show_final_results()

    def show_details(self):
        q = self.questions[self.current_question_index]
        messagebox.showinfo("Объяснение", q["explanation"], parent=self)

    def show_final_results(self):
        self.is_finished = True 
        self.recalculate_score()
        
        percentage = 0.0
        if self.total_questions > 0:
            percentage = (self.correct_answers / self.total_questions) * 100
        
        mistakes_list = []
        correct_list = [] 
        for q_index, user_answer_index in self.user_answers.items():
            if q_index < len(self.questions):
                q_text = self.questions[q_index]['question']
                if user_answer_index == self.questions[q_index]["correct_index"]:
                    correct_list.append(q_text) 
                else:
                    mistakes_list.append(q_text)
        
        if self.finish_save_callback is not None:
            self.finish_save_callback(self.theme_key, percentage, mistakes_list, correct_list)
            
        messagebox.showinfo("Тест Завершен!", 
                            f"Вы завершили тест.\n\n"
                            f"Ваш результат: {self.correct_answers} из {self.total_questions}\n"
                            f"Процент: {percentage:.1f}%",
                            parent=self)
        self.on_close() 

    def update_stats(self, question_answered=False):
        """Обновляет статистику внизу экрана."""
        q_num = self.current_question_index + 1
        questions_answered = len(self.user_answers) 

        percentage = 0.0
        if questions_answered > 0:
            percentage = (self.correct_answers / questions_answered) * 100
        
        stats_text = f"Вопрос: {q_num}/{self.total_questions} | Правильно: {self.correct_answers}/{questions_answered} ({percentage:.1f}%)"
        self.stats_label.configure(text=stats_text)


class MainMenu(ctk.CTk):
    """
    This is the main application window (the theme selector).
    """
    def __init__(self):
        super().__init__()
        
        self.title("Выбор Темы ПДД")
        self.geometry("400x300") 
        self.quiz_window = None
        self.stats_window = None 

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)
        self.grid_rowconfigure(2, weight=1) 
        self.grid_rowconfigure(3, weight=1) 
        self.grid_rowconfigure(4, weight=1) 

        self.label = ctk.CTkLabel(self, text="Пожалуйста, выберите тему для теста:", font=ctk.CTkFont(size=16))
        self.label.grid(row=0, column=0, padx=20, pady=(20, 10))

        self.stats = {}
        self.file_map = {} 
        self.load_stats() 
        self.find_themes() 
        
        display_names = self.get_display_names() 
        
        if not display_names:
            display_names = ["Нет тем (Запустите converter.py)"]
        
        self.theme_var = ctk.StringVar(value=display_names[0] if display_names else "")
        self.theme_menu = ctk.CTkOptionMenu(self, values=display_names, variable=self.theme_var, font=ctk.CTkFont(size=14))
        self.theme_menu.grid(row=1, column=0, padx=20, pady=10, sticky="ew")

        self.start_button = ctk.CTkButton(self, text="Начать Тест", command=self.start_quiz, font=ctk.CTkFont(size=14))
        self.start_button.grid(row=2, column=0, padx=20, pady=(10, 5))

        self.practice_button = ctk.CTkButton(self, text="Проработать ошибки", command=self.start_practice_mode, font=ctk.CTkFont(size=14))
        self.practice_button.grid(row=3, column=0, padx=20, pady=(5, 5)) 

        self.stats_button = ctk.CTkButton(self, text="Общая Статистика", command=self.show_statistics_window, font=ctk.CTkFont(size=14))
        self.stats_button.grid(row=4, column=0, padx=20, pady=(5, 20))
        
        if "Нет тем" in (display_names[0] if display_names else ""):
            self.start_button.configure(state="disabled")
            
        self.refresh_menu_display() 

    def load_stats(self):
        """Загружает статистику из JSON файла."""
        try:
            with open(STATS_FILE, 'r', encoding='utf-8') as f:
                self.stats = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            self.stats = {} 
    
    def _save_stats_to_file(self):
        """Внутренняя функция для записи self.stats в JSON."""
        try:
            with open(STATS_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.stats, f, indent=4, ensure_ascii=False)
        except Exception as e:
            print(f"Ошибка при сохранении статистики: {e}")
            
    def save_quiz_results(self, theme_key, new_score, mistakes_list, correct_list):
        """(Колбэк) Сохраняет РЕЗУЛЬТАТЫ теста и удаляет сессию."""
        new_score = int(round(new_score))
        
        theme_stats = self.stats.get(theme_key, {})
        
        current_best = theme_stats.get('best_score', 0)
        if new_score > current_best:
            theme_stats['best_score'] = new_score
        
        mistake_history = theme_stats.get('mistake_history', [])
        mistake_history.insert(0, mistakes_list) 
        theme_stats['mistake_history'] = mistake_history[:MISTAKE_HISTORY_LIMIT] 
        
        correct_set = set(theme_stats.get('correctly_answered_questions', []))
        correct_set.update(correct_list)
        theme_stats['correctly_answered_questions'] = list(correct_set)
        
        if 'session_data' in theme_stats:
            del theme_stats['session_data']
        
        self.stats[theme_key] = theme_stats
        self._save_stats_to_file()
        self.refresh_menu_display()
        
    def save_session_data(self, theme_key, session_data):
        """(Колбэк) Сохраняет данные НЕЗАКОНЧЕННОЙ сессии."""
        theme_stats = self.stats.get(theme_key, {})
        theme_stats['session_data'] = session_data
        self.stats[theme_key] = theme_stats
        self._save_stats_to_file()
        self.refresh_menu_display() 
        
    def clear_session_data(self, theme_key):
        """(Колбэк) Удаляет данные сессии (если пользователь нажал 'Нет')."""
        theme_stats = self.stats.get(theme_key, {})
        if 'session_data' in theme_stats:
            del theme_stats['session_data']
            self.stats[theme_key] = theme_stats
            self._save_stats_to_file()
        self.refresh_menu_display() 
        
    def has_any_mistakes(self):
        """Проверяет, есть ли хотя бы одна ошибка в истории."""
        for theme_stats in self.stats.values():
            history = theme_stats.get('mistake_history', [])
            if any(len(run) > 0 for run in history):
                return True
        return False

    def refresh_menu_display(self):
        """Обновляет список тем в выпадающем меню новыми результатами."""
        current_selection_display = self.theme_var.get()
        current_selection_clean = current_selection_display.split(' (')[0].split(' [')[0]
        
        new_display_names = self.get_display_names()
        if new_display_names:
            self.theme_menu.configure(values=new_display_names)
        
        new_selection_display = current_selection_clean 
        theme_stats = self.stats.get(current_selection_clean, {})
        
        if 'session_data' in theme_stats:
            new_selection_display = f"{current_selection_clean} [Продолжить]"
        elif 'best_score' in theme_stats:
            score = theme_stats.get('best_score')
            new_selection_display = f"{current_selection_clean} (Лучший: {score}%)"
            
        if new_selection_display in new_display_names:
            self.theme_menu.set(new_selection_display)
        elif new_display_names:
            self.theme_menu.set(new_display_names[0])
        else:
            self.theme_menu.set("Нет тем (Запустите converter.py)")
            
        if self.has_any_mistakes():
            self.practice_button.configure(state="normal")
        else:
            self.practice_button.configure(state="disabled")

    def find_themes(self):
        """Находит .py файлы и заполняет self.file_map (чистое имя -> имя файла)"""
        self.file_map.clear()
        if not os.path.exists(QUIZ_DATA_DIR):
            print(f"Directory not found: {QUIZ_DATA_DIR}. Please run converter.py")
            return
            
        files = [f for f in os.listdir(QUIZ_DATA_DIR) if f.endswith('.py') and f != '__init__.py']
        for f in sorted(files):
            clean_name = f.replace(".py", "").replace("_", " ")
            self.file_map[clean_name] = f
            
    def get_display_names(self):
        """Создает список имен для меню, используя self.stats и self.file_map."""
        display_names = []
        for clean_name in sorted(self.file_map.keys()):
            theme_stats = self.stats.get(clean_name, {})
            score = theme_stats.get('best_score')
            has_session = 'session_data' in theme_stats
            
            display_text = clean_name
            if has_session:
                display_text += " [Продолжить]" 
            elif score is not None:
                display_text += f" (Лучший: {score}%)"
                
            display_names.append(display_text)
        return display_names

    def load_theme_data_by_key(self, theme_key):
        """Загружает данные темы по ее 'чистому' ключу (напр. "Тема 1.1")"""
        try:
            if theme_key not in self.file_map:
                print(f"Error: No file found for key '{theme_key}'")
                return None
                
            theme_filename = self.file_map[theme_key]
            module_name = theme_filename.replace('.py', '')
            filepath = os.path.join(QUIZ_DATA_DIR, theme_filename)
            
            spec = importlib.util.spec_from_file_location(module_name, filepath)
            theme_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(theme_module)
            
            return theme_module.QUIZ_DATA
        except Exception as e:
            print(f"Error loading theme {theme_key} (file: {theme_filename}): {e}")
            return None

    def start_quiz(self):
        """Запускает обычный тест, ПРОВЕРЯЯ НАЛИЧИЕ СЕССИИ."""
        if self.quiz_window is not None:
            self.quiz_window.focus()
            return

        selected_display_name = self.theme_var.get()
        if not selected_display_name or "Нет тем" in selected_display_name:
            return
            
        theme_key = selected_display_name.split(' (')[0].split(' [')[0]
        
        quiz_data = self.load_theme_data_by_key(theme_key)
        if quiz_data is None:
             messagebox.showerror("Ошибка", f"Не удалось загрузить данные для {theme_key}")
             return

        theme_stats = self.stats.get(theme_key, {})
        saved_session = theme_stats.get('session_data')
        
        initial_session_data = None 
        
        if saved_session:
            msg = messagebox.askyesnocancel("Продолжить?", 
                                            "У вас есть сохраненная сессия для этой темы. Хотите продолжить?",
                                            parent=self)
            
            if msg is True: # "Да" (Продолжить)
                initial_session_data = saved_session
            elif msg is False: # "Нет" (Начать заново)
                self.clear_session_data(theme_key) 
            elif msg is None: # "Отмена"
                return 
        
        self.quiz_window = QuizApp(self, 
                                   quiz_data, 
                                   theme_key, 
                                   self.save_quiz_results, 
                                   self.save_session_data,
                                   self.clear_session_data,
                                   initial_session=initial_session_data)
            
    def start_practice_mode(self):
        """Запускает тест на основе всех недавних ошибок (БЕЗ СОХРАНЕНИЯ СЕССИЙ)."""
        if self.quiz_window is not None:
            self.quiz_window.focus()
            return

        print("Собираем вопросы с ошибками...")
        unique_mistakes = set()
        for theme_stats in self.stats.values():
            history = theme_stats.get('mistake_history', [])
            for run in history:
                unique_mistakes.update(run) 

        if not unique_mistakes:
            messagebox.showinfo("Чисто!", "У вас нет ошибок за последние 3 прохождения.")
            return

        practice_quiz_data = []
        for theme_key in self.file_map.keys():
            theme_data = self.load_theme_data_by_key(theme_key)
            if not theme_data:
                continue
            
            for q_dict in theme_data:
                if q_dict['question'] in unique_mistakes:
                    practice_quiz_data.append(q_dict)
                    unique_mistakes.remove(q_dict['question']) 
                if not unique_mistakes:
                    break
            if not unique_mistakes:
                break

        if not practice_quiz_data:
            messagebox.showinfo("Ошибка", "Не удалось загрузить вопросы с ошибками. Возможно, файлы тем были изменены.")
            return
        
        random.shuffle(practice_quiz_data) 
        
        self.quiz_window = QuizApp(self, 
                                   practice_quiz_data, 
                                   "Проработка ошибок", 
                                   finish_save_callback=None,
                                   session_save_callback=None,
                                   session_clear_callback=None,
                                   initial_session=None)

    def calculate_overall_stats(self):
        """Сканирует все темы и .json для подсчета общей статистики."""
        all_correctly_answered = set()
        all_questions_with_mistakes = set()
        total_questions_in_library = 0
        
        self.load_stats() 
        
        for theme_key in self.file_map.keys():
            theme_data = self.load_theme_data_by_key(theme_key)
            if theme_data:
                total_questions_in_library += len(theme_data)
            
            theme_stats = self.stats.get(theme_key, {})
            
            correct_set = set(theme_stats.get('correctly_answered_questions', []))
            all_correctly_answered.update(correct_set)
            
            wrong_set = set()
            for run in theme_stats.get('mistake_history', []):
                wrong_set.update(run)
            all_questions_with_mistakes.update(wrong_set)
            
        all_answered_questions = all_correctly_answered.union(all_questions_with_mistakes)
        
        total_answered = len(all_answered_questions)
        total_correct = len(all_correctly_answered)
        total_wrong = len(all_questions_with_mistakes)
        
        percentage_covered = 0.0
        if total_questions_in_library > 0:
            percentage_covered = (total_answered / total_questions_in_library) * 100
            
        return {
            "total_questions": total_questions_in_library,
            "total_answered": total_answered,
            "total_correct": total_correct,
            "total_wrong": total_wrong,
            "percentage_covered": percentage_covered
        }

    def show_statistics_window(self):
        """Открывает новое окно с общей статистикой."""
        if self.stats_window is not None:
            self.stats_window.focus()
            return
            
        try:
            stats = self.calculate_overall_stats()
        except Exception as e:
            messagebox.showerror("Ошибка", f"Не удалось подсчитать статистику: {e}")
            return
            
        self.stats_window = ctk.CTkToplevel(self)
        self.stats_window.title("Общая Статистика")
        self.stats_window.geometry("450x250")
        self.stats_window.grab_set()
        
        # --- ИСПРАВЛЕНИЕ ЗДЕСЬ ---
        # Функция для закрытия
        def on_stats_close():
            # Сначала уничтожаем окно
            self.stats_window.destroy()
            # ПОТОМ обнуляем ссылку
            self.stats_window = None
        # ---------------------
            
        self.stats_window.protocol("WM_DELETE_WINDOW", on_stats_close)
        
        frame = ctk.CTkFrame(self.stats_window)
        frame.pack(padx=20, pady=20, fill="both", expand=True)
        
        title_label = ctk.CTkLabel(frame, text="Ваш Общий Прогресс", font=ctk.CTkFont(size=18, weight="bold"))
        title_label.pack(pady=(0, 15))
        
        stats_text = (
            f"Охват материала:\t{stats['percentage_covered']:.1f} %\n\n"
            f"Всего вопросов в базе:\t{stats['total_questions']}\n"
            f"Пройдено уникальных:\t{stats['total_answered']}\n\n"
            f"Уникальных правильных:\t{stats['total_correct']}\n"
            f"Уникальных с ошибками:\t{stats['total_wrong']}"
        )
        
        stats_label = ctk.CTkLabel(frame, text=stats_text, font=ctk.CTkFont(size=14), justify="left")
        stats_label.pack(anchor="w", padx=20)


if __name__ == "__main__":
    if not os.path.exists(IMAGE_DIR):
        os.makedirs(IMAGE_DIR)
        print(f"Created '{IMAGE_DIR}' directory for your images.")

    if not os.path.exists(QUIZ_DATA_DIR):
        print(f"Warning: '{QUIZ_DATA_DIR}' not found.")
        print("Please run converter.py to generate your quiz files.")

    app = MainMenu()
    app.mainloop()