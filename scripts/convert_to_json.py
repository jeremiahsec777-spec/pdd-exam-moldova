# -*- coding: utf-8 -*-
"""
Converts all .py quiz modules from quiz_data_modules/ into a single JSON file.
"""
import os
import sys
import json
import importlib.util

QUIZ_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'quiz_data_modules'))
OUTPUT_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'quiz_data.json'))

def load_module_data(filepath):
    module_name = os.path.basename(filepath).replace('.py', '')
    spec = importlib.util.spec_from_file_location(module_name, filepath)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.QUIZ_DATA

def main():
    if not os.path.exists(QUIZ_DATA_DIR):
        print(f"Error: {QUIZ_DATA_DIR} not found")
        sys.exit(1)

    files = sorted([f for f in os.listdir(QUIZ_DATA_DIR) if f.endswith('.py') and f != '__init__.py'])
    
    topics = {}
    total_questions = 0
    
    for f in files:
        clean_name = f.replace(".py", "").replace("_", " ")
        filepath = os.path.join(QUIZ_DATA_DIR, f)
        
        try:
            quiz_data = load_module_data(filepath)
            # Add unique IDs to each question
            questions = []
            for i, q in enumerate(quiz_data):
                q_with_id = {
                    "id": f"{clean_name}_{i}",
                    "question": q["question"],
                    "options": q["options"],
                    "correct_index": q["correct_index"],
                    "explanation": q["explanation"],
                    "image": q.get("image")
                }
                questions.append(q_with_id)
            
            topics[clean_name] = {
                "questions": questions,
                "count": len(questions)
            }
            total_questions += len(questions)
            print(f"  ✓ {clean_name}: {len(questions)} questions")
        except Exception as e:
            print(f"  ✗ {clean_name}: {e}")
    
    output = {
        "topics": topics,
        "totalQuestions": total_questions,
        "topicCount": len(topics)
    }
    
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"\n✓ Done! {total_questions} questions across {len(topics)} topics")
    print(f"  Output: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
