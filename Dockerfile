# ---- build ----
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY nuget.config Directory.Build.props ./
COPY src/FormBuilder.Mvc/FormBuilder.Mvc.csproj src/FormBuilder.Mvc/
RUN dotnet restore src/FormBuilder.Mvc/FormBuilder.Mvc.csproj
COPY src/ src/
RUN dotnet publish src/FormBuilder.Mvc/FormBuilder.Mvc.csproj -c Release -o /app --no-restore

# ---- runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app
COPY --from=build /app .
# Api__BaseUrl points at form-builder-api, e.g. http://api:8080/
ENV ASPNETCORE_HTTP_PORTS=8080
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "FormBuilder.Mvc.dll"]
