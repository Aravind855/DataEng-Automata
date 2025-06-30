from langchain_google_genai import ChatGoogleGenerativeAI
llm = ChatGoogleGenerativeAI(model='gemini-1.5-flash', google_api_key='AIzaSyBteERgxRj5qPWyDufZGPlT1qfVvho9m5U')
print(llm.invoke('Test').content)
