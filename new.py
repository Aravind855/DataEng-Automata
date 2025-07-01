from langchain_google_genai import ChatGoogleGenerativeAI
llm = ChatGoogleGenerativeAI(model='gemini-2.0-flash', google_api_key='AIzaSyBKNmM-Si0EZ7nIi4inYqIBCGO165uSIH0')
print(llm.invoke('Test').content)
